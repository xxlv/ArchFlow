export const TASK_API_CHANNEL = "Task_API" as const;
export const TASK_API_ENDPOINT = "/task-api";

export const TASK_STATUSES = ["todo", "doing", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskRecord {
  id: string;
  title: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface TaskApiEnvelope<TPayload extends TaskApiPayload = TaskApiPayload> {
  traceId: string;
  payload: TPayload;
}

export interface ListTasksPayload {
  channel: typeof TASK_API_CHANNEL;
  operation: "list";
}

export interface CreateTaskPayload {
  channel: typeof TASK_API_CHANNEL;
  operation: "create";
  title: string;
  status: TaskStatus;
}

export interface UpdateTaskPayload {
  channel: typeof TASK_API_CHANNEL;
  operation: "update";
  taskId: string;
  changes: Partial<Pick<TaskRecord, "title" | "status">>;
}

export interface DeleteTaskPayload {
  channel: typeof TASK_API_CHANNEL;
  operation: "delete";
  taskId: string;
}

export type TaskApiPayload = ListTasksPayload | CreateTaskPayload | UpdateTaskPayload | DeleteTaskPayload;

export interface TaskListResponse {
  tasks: TaskRecord[];
}

export interface TaskMutationResponse {
  task: TaskRecord;
}

export interface TaskDeleteResponse {
  deletedTaskId: string;
}

export interface TaskApiErrorResponse {
  error: string;
}

export type TaskApiResponse = TaskListResponse | TaskMutationResponse | TaskDeleteResponse | TaskApiErrorResponse;
