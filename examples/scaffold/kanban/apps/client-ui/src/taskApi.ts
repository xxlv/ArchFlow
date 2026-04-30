import {
  TASK_API_CHANNEL,
  TASK_API_ENDPOINT,
  TASK_STATUSES,
  type CreateTaskPayload,
  type DeleteTaskPayload,
  type ListTasksPayload,
  type TaskApiEnvelope,
  type TaskApiPayload,
  type TaskDeleteResponse,
  type TaskListResponse,
  type TaskMutationResponse,
  type TaskRecord,
  type TaskStatus,
  type UpdateTaskPayload
} from "./contracts";

export interface TaskApiClient {
  listTasks(): Promise<TaskRecord[]>;
  createTask(title: string, status?: TaskStatus): Promise<TaskRecord>;
  updateTask(taskId: string, changes: UpdateTaskPayload["changes"]): Promise<TaskRecord>;
  deleteTask(taskId: string): Promise<string>;
}

export interface TaskApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  traceIdFactory?: () => string;
}

export class TaskApiError extends Error {
  readonly status?: number;
  readonly traceId?: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status?: number; traceId?: string; details?: unknown } = {}
  ) {
    super(message);
    this.name = "TaskApiError";
    this.status = options.status;
    this.traceId = options.traceId;
    this.details = options.details;
  }
}

export function createTaskApiClient(options: TaskApiClientOptions = {}): TaskApiClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  const traceIdFactory = options.traceIdFactory ?? createTraceId;
  const endpoint = buildEndpoint(options.baseUrl ?? "");

  if (!fetchImpl) {
    throw new TaskApiError("Task API fetch implementation is unavailable.");
  }

  async function send<TPayload extends TaskApiPayload, TResponse>(payload: TPayload): Promise<TResponse> {
    const message: TaskApiEnvelope<TPayload> = {
      traceId: traceIdFactory(),
      payload
    };

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(message)
    });

    const body = await readJson(response);
    const responsePayload = unwrapPayload<unknown>(body);

    if (!response.ok || isTaskApiErrorResponse(responsePayload)) {
      throw new TaskApiError(readErrorMessage(body, response.statusText), {
        status: response.ok ? undefined : response.status,
        traceId: message.traceId,
        details: body
      });
    }

    return responsePayload as TResponse;
  }

  return {
    async listTasks() {
      const payload: ListTasksPayload = {
        channel: TASK_API_CHANNEL,
        operation: "list"
      };
      const response = await send<ListTasksPayload, TaskListResponse>(payload);
      return requireTaskListResponse(response).tasks;
    },

    async createTask(title, status = "todo") {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        throw new TaskApiError("Task title is required.");
      }
      assertTaskStatus(status);

      const payload: CreateTaskPayload = {
        channel: TASK_API_CHANNEL,
        operation: "create",
        title: cleanTitle,
        status
      };
      const response = await send<CreateTaskPayload, TaskMutationResponse>(payload);
      return requireTaskMutationResponse(response).task;
    },

    async updateTask(taskId, changes) {
      const cleanTaskId = normalizeTaskId(taskId);
      const cleanChanges = normalizeTaskChanges(changes);

      const payload: UpdateTaskPayload = {
        channel: TASK_API_CHANNEL,
        operation: "update",
        taskId: cleanTaskId,
        changes: cleanChanges
      };
      const response = await send<UpdateTaskPayload, TaskMutationResponse>(payload);
      return requireTaskMutationResponse(response).task;
    },

    async deleteTask(taskId) {
      const cleanTaskId = normalizeTaskId(taskId);

      const payload: DeleteTaskPayload = {
        channel: TASK_API_CHANNEL,
        operation: "delete",
        taskId: cleanTaskId
      };
      const response = await send<DeleteTaskPayload, TaskDeleteResponse>(payload);
      return requireTaskDeleteResponse(response).deletedTaskId;
    }
  };
}

function buildEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return TASK_API_ENDPOINT;
  }
  return `${trimmed.replace(/\/$/, "")}${TASK_API_ENDPOINT}`;
}

function createTraceId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `client-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new TaskApiError("Task API returned invalid JSON.", {
      status: response.status,
      details: error
    });
  }
}

function unwrapPayload<TResponse>(body: unknown): TResponse {
  if (isRecord(body) && "payload" in body) {
    return body.payload as TResponse;
  }
  return body as TResponse;
}

function readErrorMessage(body: unknown, fallback: string): string {
  if (isRecord(body) && typeof body.error === "string") {
    return body.error;
  }
  if (isRecord(body) && typeof body.message === "string") {
    return body.message;
  }
  if (isRecord(body) && isRecord(body.payload) && typeof body.payload.error === "string") {
    return body.payload.error;
  }
  return fallback || "Task API request failed.";
}

function normalizeTaskId(taskId: string): string {
  const cleanTaskId = taskId.trim();
  if (!cleanTaskId) {
    throw new TaskApiError("Task id is required.");
  }
  return cleanTaskId;
}

function normalizeTaskChanges(changes: UpdateTaskPayload["changes"]): UpdateTaskPayload["changes"] {
  if (!isRecord(changes)) {
    throw new TaskApiError("Task changes are required.");
  }

  const cleanChanges: UpdateTaskPayload["changes"] = {};

  if (Object.prototype.hasOwnProperty.call(changes, "title") && changes.title !== undefined) {
    if (typeof changes.title !== "string") {
      throw new TaskApiError("Task title is required.");
    }
    const cleanTitle = changes.title.trim();
    if (!cleanTitle) {
      throw new TaskApiError("Task title is required.");
    }
    cleanChanges.title = cleanTitle;
  }

  if (Object.prototype.hasOwnProperty.call(changes, "status") && changes.status !== undefined) {
    assertTaskStatus(changes.status);
    cleanChanges.status = changes.status;
  }

  if (
    !Object.prototype.hasOwnProperty.call(cleanChanges, "title") &&
    !Object.prototype.hasOwnProperty.call(cleanChanges, "status")
  ) {
    throw new TaskApiError("Task changes are required.");
  }

  return cleanChanges;
}

function requireTaskListResponse(response: TaskListResponse): TaskListResponse {
  if (isRecord(response) && Array.isArray(response.tasks) && response.tasks.every(isTaskRecord)) {
    return response;
  }
  throw new TaskApiError("Task API returned an invalid task list response.", {
    details: response
  });
}

function requireTaskMutationResponse(response: TaskMutationResponse): TaskMutationResponse {
  if (isRecord(response) && isTaskRecord(response.task)) {
    return response;
  }
  throw new TaskApiError("Task API returned an invalid task mutation response.", {
    details: response
  });
}

function requireTaskDeleteResponse(response: TaskDeleteResponse): TaskDeleteResponse {
  if (isRecord(response) && typeof response.deletedTaskId === "string") {
    return response;
  }
  throw new TaskApiError("Task API returned an invalid task delete response.", {
    details: response
  });
}

function isTaskRecord(value: unknown): value is TaskRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    isTaskStatus(value.status) &&
    typeof value.createdAt === "string" &&
    (!Object.prototype.hasOwnProperty.call(value, "updatedAt") ||
      typeof value.updatedAt === "string" ||
      value.updatedAt === undefined)
  );
}

function assertTaskStatus(value: unknown): asserts value is TaskStatus {
  if (!isTaskStatus(value)) {
    throw new TaskApiError("Task status must be todo, doing, or done.");
  }
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

function isTaskApiErrorResponse(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
