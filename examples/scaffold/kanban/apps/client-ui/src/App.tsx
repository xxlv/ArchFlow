import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Loader2,
  PlusCircle,
  RefreshCw,
  Timer,
  Trash2
} from "lucide-react";
import { TASK_STATUSES, type TaskRecord, type TaskStatus } from "./contracts";
import { createTaskApiClient, TaskApiError, type TaskApiClient } from "./taskApi";
import "./styles.css";

interface AppProps {
  api?: TaskApiClient;
}

const defaultTaskApiClient = createTaskApiClient();

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  doing: "Doing",
  done: "Done"
};

const statusIcons: Record<TaskStatus, typeof Circle> = {
  todo: Circle,
  doing: Timer,
  done: CheckCircle2
};

export default function App({ api = defaultTaskApiClient }: AppProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>("todo");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshTasks = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);

      try {
        const loadedTasks = await api.listTasks();
        setTasks(sortTasks(loadedTasks));
      } catch (caughtError) {
        setError(toErrorMessage(caughtError));
      } finally {
        if (!options.silent) {
          setLoading(false);
        }
      }
    },
    [api]
  );

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const taskGroups = useMemo(() => {
    return TASK_STATUSES.reduce<Record<TaskStatus, TaskRecord[]>>(
      (groups, status) => {
        groups[status] = tasks.filter((task) => task.status === status);
        return groups;
      },
      { todo: [], doing: [], done: [] }
    );
  }, [tasks]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = newTaskTitle.trim();
    if (!cleanTitle) {
      setError("Task title is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await api.createTask(cleanTitle, newTaskStatus);
      setNewTaskTitle("");
      await refreshTasks({ silent: true });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setSubmitting(false);
    }
  }

  async function moveTask(task: TaskRecord, status: TaskStatus) {
    if (task.status === status || updatingTaskId || deletingTaskId) {
      return;
    }

    setUpdatingTaskId(task.id);
    setError(null);

    try {
      await api.updateTask(task.id, { status });
      await refreshTasks({ silent: true });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function deleteTask(task: TaskRecord) {
    if (updatingTaskId || deletingTaskId) {
      return;
    }

    setDeletingTaskId(task.id);
    setError(null);

    try {
      await api.deleteTask(task.id);
      await refreshTasks({ silent: true });
    } catch (caughtError) {
      setError(toErrorMessage(caughtError));
    } finally {
      setDeletingTaskId(null);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TaskBoard</p>
          <h1>Board</h1>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Refresh tasks"
          title="Refresh tasks"
          onClick={() => void refreshTasks()}
          disabled={loading}
        >
          <RefreshCw size={18} aria-hidden="true" />
        </button>
      </header>

      <form className="task-form" onSubmit={handleSubmit}>
        <label className="field-label" htmlFor="task-title">
          New task
        </label>
        <input
          id="task-title"
          className="task-input"
          type="text"
          value={newTaskTitle}
          onChange={(event) => setNewTaskTitle(event.target.value)}
          placeholder="Title"
          maxLength={120}
        />
        <div className="segmented-control" aria-label="New task status">
          {TASK_STATUSES.map((status) => {
            const Icon = statusIcons[status];
            return (
              <button
                className={newTaskStatus === status ? "segment is-selected" : "segment"}
                type="button"
                key={status}
                aria-pressed={newTaskStatus === status}
                onClick={() => setNewTaskStatus(status)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{statusLabels[status]}</span>
              </button>
            );
          })}
        </div>
        <button className="primary-button" type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="spin" size={18} aria-hidden="true" /> : <PlusCircle size={18} aria-hidden="true" />}
          <span>Add task</span>
        </button>
      </form>

      {error ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="board" aria-busy={loading}>
        {TASK_STATUSES.map((status) => {
          const Icon = statusIcons[status];
          const columnTasks = taskGroups[status];

          return (
            <article className="column" key={status}>
              <header className="column-header">
                <div>
                  <Icon size={18} aria-hidden="true" />
                  <h2>{statusLabels[status]}</h2>
                </div>
                <span className="task-count">{columnTasks.length}</span>
              </header>

              <div className="task-list">
                {loading ? (
                  <div className="empty-state">
                    <Loader2 className="spin" size={18} aria-hidden="true" />
                    <span>Loading</span>
                  </div>
                ) : columnTasks.length === 0 ? (
                  <p className="empty-state">No tasks</p>
                ) : (
                  columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      moveBusy={updatingTaskId === task.id}
                      deleteBusy={deletingTaskId === task.id}
                      disabled={Boolean(updatingTaskId || deletingTaskId)}
                      onMove={moveTask}
                      onDelete={deleteTask}
                    />
                  ))
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}

interface TaskCardProps {
  task: TaskRecord;
  moveBusy: boolean;
  deleteBusy: boolean;
  disabled: boolean;
  onMove(task: TaskRecord, status: TaskStatus): void;
  onDelete(task: TaskRecord): void;
}

function TaskCard({ task, moveBusy, deleteBusy, disabled, onMove, onDelete }: TaskCardProps) {
  return (
    <article className="task-card">
      <div>
        <h3>{task.title}</h3>
        <time dateTime={task.createdAt}>{formatDate(task.createdAt)}</time>
      </div>
      <div className="task-actions" aria-label={`Task actions for ${task.title}`}>
        {TASK_STATUSES.map((status) => {
          const Icon = statusIcons[status];
          const selected = task.status === status;
          return (
            <button
              className={selected ? "status-button is-selected" : "status-button"}
              type="button"
              key={status}
              aria-label={`Move to ${statusLabels[status]}`}
              title={`Move to ${statusLabels[status]}`}
              aria-pressed={selected}
              disabled={disabled || selected}
              onClick={() => onMove(task, status)}
            >
              {moveBusy && selected ? (
                <Loader2 className="spin" size={15} aria-hidden="true" />
              ) : (
                <Icon size={15} aria-hidden="true" />
              )}
            </button>
          );
        })}
        <button
          className="status-button danger-button"
          type="button"
          aria-label={`Delete ${task.title}`}
          title={`Delete ${task.title}`}
          disabled={disabled}
          onClick={() => onDelete(task)}
        >
          {deleteBusy ? (
            <Loader2 className="spin" size={15} aria-hidden="true" />
          ) : (
            <Trash2 size={15} aria-hidden="true" />
          )}
        </button>
      </div>
    </article>
  );
}

function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((left, right) => {
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unscheduled";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toErrorMessage(error: unknown): string {
  if (error instanceof TaskApiError || error instanceof Error) {
    return error.message;
  }
  return "Task API request failed.";
}
