import { describe, expect, it, vi } from "vitest";
import { TASK_API_CHANNEL } from "../src/contracts";
import { createTaskApiClient, TaskApiError } from "../src/taskApi";

describe("Task_API boundary adapter", () => {
  it("sends list requests as ArchFlow JSON messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        payload: {
          tasks: []
        }
      })
    );
    const api = createTaskApiClient({
      baseUrl: "https://tasks.example.test",
      fetchImpl,
      traceIdFactory: () => "trace-list"
    });

    await expect(api.listTasks()).resolves.toEqual([]);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://tasks.example.test/task-api",
      expect.objectContaining({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          traceId: "trace-list",
          payload: {
            channel: TASK_API_CHANNEL,
            operation: "list"
          }
        })
      })
    );
  });

  it("trims task titles before create requests", async () => {
    const task = {
      id: "task-1",
      title: "Write tests",
      status: "todo",
      createdAt: "2026-04-30T10:00:00.000Z"
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ payload: { task } }));
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-create"
    });

    await expect(api.createTask("  Write tests  ")).resolves.toEqual(task);

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      payload: { title: string };
    };
    expect(request.payload.title).toBe("Write tests");
  });

  it("sends update requests as ArchFlow JSON messages", async () => {
    const task = {
      id: "task-1",
      title: "Write tests",
      status: "done",
      createdAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:05:00.000Z"
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ payload: { task } }));
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-update"
    });

    await expect(api.updateTask("task-1", { status: "done" })).resolves.toEqual(task);

    expect(fetchImpl).toHaveBeenCalledWith(
      "/task-api",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          traceId: "trace-update",
          payload: {
            channel: TASK_API_CHANNEL,
            operation: "update",
            taskId: "task-1",
            changes: {
              status: "done"
            }
          }
        })
      })
    );
  });

  it("normalizes update requests before crossing the boundary", async () => {
    const task = {
      id: "task-1",
      title: "Clean title",
      status: "doing",
      createdAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:05:00.000Z"
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ payload: { task } }));
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-normalize"
    });

    await expect(
      api.updateTask("  task-1  ", { title: "  Clean title  ", status: "doing" })
    ).resolves.toEqual(task);

    const request = JSON.parse(fetchImpl.mock.calls[0][1].body as string) as {
      payload: { taskId: string; changes: { title: string; status: string } };
    };
    expect(request.payload.taskId).toBe("task-1");
    expect(request.payload.changes).toEqual({
      title: "Clean title",
      status: "doing"
    });
  });

  it("sends delete requests as ArchFlow JSON messages", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        payload: {
          deletedTaskId: "task-1"
        }
      })
    );
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-delete"
    });

    await expect(api.deleteTask("  task-1  ")).resolves.toBe("task-1");

    expect(fetchImpl).toHaveBeenCalledWith(
      "/task-api",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          traceId: "trace-delete",
          payload: {
            channel: TASK_API_CHANNEL,
            operation: "delete",
            taskId: "task-1"
          }
        })
      })
    );
  });

  it("surfaces failed boundary calls with trace context", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { payload: { error: "validation failed" } },
        { status: 400, statusText: "Bad Request" }
      )
    );
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-error"
    });

    await expect(api.createTask("Broken")).rejects.toMatchObject({
      name: "TaskApiError",
      message: "validation failed",
      status: 400,
      traceId: "trace-error"
    } satisfies Partial<TaskApiError>);
  });

  it("surfaces Task_API error payloads even when HTTP succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        payload: {
          error: "logical failure"
        }
      })
    );
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-logical-error"
    });

    await expect(api.listTasks()).rejects.toMatchObject({
      name: "TaskApiError",
      message: "logical failure",
      traceId: "trace-logical-error"
    } satisfies Partial<TaskApiError>);
  });

  it("rejects successful responses that do not match the Task_API contract", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        payload: {
          tasks: [
            {
              id: "task-1",
              title: "Missing status",
              createdAt: "2026-04-30T10:00:00.000Z"
            }
          ]
        }
      })
    );
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-invalid"
    });

    await expect(api.listTasks()).rejects.toMatchObject({
      name: "TaskApiError",
      message: "Task API returned an invalid task list response."
    } satisfies Partial<TaskApiError>);
  });

  it("rejects successful delete responses that do not match the Task_API contract", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        payload: {
          taskId: "task-1"
        }
      })
    );
    const api = createTaskApiClient({
      fetchImpl,
      traceIdFactory: () => "trace-invalid-delete"
    });

    await expect(api.deleteTask("task-1")).rejects.toMatchObject({
      name: "TaskApiError",
      message: "Task API returned an invalid task delete response."
    } satisfies Partial<TaskApiError>);
  });
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
