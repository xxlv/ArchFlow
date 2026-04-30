import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import type { TaskRecord } from "../src/contracts";
import type { TaskApiClient } from "../src/taskApi";

const initialTasks = [
  {
    id: "task-1",
    title: "Map Task_API contract",
    status: "todo",
    createdAt: "2026-04-30T09:00:00.000Z"
  },
  {
    id: "task-2",
    title: "Render board",
    status: "doing",
    createdAt: "2026-04-30T10:00:00.000Z"
  }
] as const;

describe("Client UI workflow", () => {
  it("renders the task list returned by the Task_API adapter", async () => {
    const api = makeApi({ tasks: [...initialTasks] });

    render(<App api={api} />);

    expect(await screen.findByText("Map Task_API contract")).toBeInTheDocument();
    expect(screen.getByText("Render board")).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(1);
  });

  it("submits a new task and refreshes the board", async () => {
    const api = makeApi({
      tasks: [],
      afterCreate: [
        {
          id: "task-3",
          title: "Ship isolated UI",
          status: "todo",
          createdAt: "2026-04-30T11:00:00.000Z"
        }
      ]
    });

    render(<App api={api} />);

    fireEvent.change(screen.getByLabelText("New task"), {
      target: { value: "Ship isolated UI" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith("Ship isolated UI", "todo");
    });
    expect(await screen.findByText("Ship isolated UI")).toBeInTheDocument();
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it("sends task updates through the Task_API adapter and refreshes the board", async () => {
    const api = makeApi({
      tasks: [
        {
          id: "task-4",
          title: "Move through boundary",
          status: "todo",
          createdAt: "2026-04-30T12:00:00.000Z"
        }
      ]
    });

    render(<App api={api} />);

    expect(await screen.findByText("Move through boundary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Done" }));

    await waitFor(() => {
      expect(api.updateTask).toHaveBeenCalledWith("task-4", { status: "done" });
    });
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it("sends task deletes through the Task_API adapter and refreshes the board", async () => {
    const api = makeApi({
      tasks: [
        {
          id: "task-5",
          title: "Remove through boundary",
          status: "done",
          createdAt: "2026-04-30T12:30:00.000Z"
        }
      ]
    });

    render(<App api={api} />);

    expect(await screen.findByText("Remove through boundary")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete Remove through boundary" }));

    await waitFor(() => {
      expect(api.deleteTask).toHaveBeenCalledWith("task-5");
    });
    await waitFor(() => {
      expect(screen.queryByText("Remove through boundary")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("No tasks")).toHaveLength(3);
    expect(api.listTasks).toHaveBeenCalledTimes(2);
  });

  it("shows an error message when the Task_API boundary fails", async () => {
    const api = makeApi({ tasks: [], listError: new Error("Task API unavailable") });

    render(<App api={api} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Task API unavailable");
  });
});

function makeApi(options: {
  tasks: readonly TaskRecord[];
  afterCreate?: TaskRecord[];
  listError?: Error;
}): TaskApiClient {
  let tasks = [...options.tasks] as Awaited<ReturnType<TaskApiClient["listTasks"]>>;

  return {
    listTasks: vi.fn(async () => {
      if (options.listError) {
        throw options.listError;
      }
      return tasks;
    }),
    createTask: vi.fn(async (title, status = "todo") => {
      const task = {
        id: "created-task",
        title,
        status,
        createdAt: "2026-04-30T12:00:00.000Z"
      };
      tasks = options.afterCreate ?? [task];
      return task;
    }),
    updateTask: vi.fn(async (taskId, changes) => {
      const existing = tasks.find((task) => task.id === taskId);
      const task = {
        ...(existing ?? {
          id: taskId,
          title: "Updated task",
          status: "todo",
          createdAt: "2026-04-30T12:00:00.000Z"
        }),
        ...changes
      };
      tasks = tasks.map((item) => (item.id === task.id ? task : item));
      return task;
    }),
    deleteTask: vi.fn(async (taskId) => {
      tasks = tasks.filter((task) => task.id !== taskId);
      return taskId;
    })
  };
}
