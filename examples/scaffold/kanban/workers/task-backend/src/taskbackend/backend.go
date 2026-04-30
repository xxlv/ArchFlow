package taskbackend

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	TaskAPIChannel    = "Task_API"
	TaskEventsChannel = "Task_Events"
	TaskAPIEndpoint   = "/task-api"
)

var (
	ErrValidation = errors.New("validation failed")
	ErrNotFound   = errors.New("task not found")
)

type TaskStatus string

const (
	StatusTodo  TaskStatus = "todo"
	StatusDoing TaskStatus = "doing"
	StatusDone  TaskStatus = "done"
)

type TaskRecord struct {
	ID        string     `json:"id"`
	Title     string     `json:"title"`
	Status    TaskStatus `json:"status"`
	CreatedAt string     `json:"createdAt"`
	UpdatedAt string     `json:"updatedAt,omitempty"`
}

type TaskChanges struct {
	Title  *string     `json:"title,omitempty"`
	Status *TaskStatus `json:"status,omitempty"`
}

type TaskAPIEnvelope struct {
	TraceID string          `json:"traceId"`
	Payload json.RawMessage `json:"payload"`
}

type TaskEventEnvelope struct {
	TraceID string           `json:"traceId"`
	Payload TaskEventPayload `json:"payload"`
}

type TaskEventPayload struct {
	Channel   string     `json:"channel"`
	EventType string     `json:"eventType"`
	Task      TaskRecord `json:"task"`
}

type Store interface {
	ListTasks(ctx context.Context) ([]TaskRecord, error)
	CreateTask(ctx context.Context, task TaskRecord) (TaskRecord, error)
	UpdateTask(ctx context.Context, taskID string, changes TaskChanges, updatedAt string) (TaskRecord, error)
	DeleteTask(ctx context.Context, taskID string) (TaskRecord, error)
}

type EventPublisher interface {
	PublishTaskEvent(ctx context.Context, envelope TaskEventEnvelope) error
}

type Handler struct {
	store     Store
	publisher EventPublisher
	clock     func() time.Time
	idFactory func() string
}

type HandlerOption func(*Handler)

func NewHandler(store Store, publisher EventPublisher, options ...HandlerOption) *Handler {
	handler := &Handler{
		store:     store,
		publisher: publisher,
		clock:     time.Now,
		idFactory: newTaskID,
	}
	if handler.store == nil {
		handler.store = NewInMemoryStore()
	}
	if handler.publisher == nil {
		handler.publisher = NopEventPublisher{}
	}
	for _, option := range options {
		option(handler)
	}
	return handler
}

func WithClock(clock func() time.Time) HandlerOption {
	return func(handler *Handler) {
		if clock != nil {
			handler.clock = clock
		}
	}
}

func WithIDFactory(idFactory func() string) HandlerOption {
	return func(handler *Handler) {
		if idFactory != nil {
			handler.idFactory = idFactory
		}
	}
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	setJSONHeaders(response)

	if request.Method == http.MethodOptions {
		response.WriteHeader(http.StatusNoContent)
		return
	}
	if request.Method != http.MethodPost {
		writeError(response, "", http.StatusMethodNotAllowed, "Task_API only accepts POST requests.")
		return
	}

	var envelope TaskAPIEnvelope
	decoder := json.NewDecoder(request.Body)
	if err := decoder.Decode(&envelope); err != nil {
		writeError(response, "", http.StatusBadRequest, "Task_API request body must be valid JSON.")
		return
	}
	if strings.TrimSpace(envelope.TraceID) == "" {
		writeError(response, "", http.StatusBadRequest, "traceId is required.")
		return
	}
	if len(envelope.Payload) == 0 {
		writeError(response, envelope.TraceID, http.StatusBadRequest, "payload is required.")
		return
	}

	result, err := handler.route(request.Context(), envelope)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, ErrValidation) {
			status = http.StatusBadRequest
		}
		if errors.Is(err, ErrNotFound) {
			status = http.StatusNotFound
		}
		writeError(response, envelope.TraceID, status, err.Error())
		return
	}

	writeJSON(response, http.StatusOK, map[string]any{
		"traceId": envelope.TraceID,
		"payload": result,
	})
}

func (handler *Handler) route(ctx context.Context, envelope TaskAPIEnvelope) (any, error) {
	var payload taskAPIRequest
	if err := json.Unmarshal(envelope.Payload, &payload); err != nil {
		return nil, validationError("payload must be a JSON object")
	}
	if payload.Channel != TaskAPIChannel {
		return nil, validationError("payload.channel must be Task_API")
	}

	switch payload.Operation {
	case "list":
		tasks, err := handler.store.ListTasks(ctx)
		if err != nil {
			return nil, fmt.Errorf("list tasks: %w", err)
		}
		return map[string]any{"tasks": tasks}, nil
	case "create":
		return handler.createTask(ctx, envelope.TraceID, payload)
	case "update":
		return handler.updateTask(ctx, envelope.TraceID, payload)
	case "delete":
		return handler.deleteTask(ctx, envelope.TraceID, payload)
	default:
		return nil, validationError("payload.operation must be one of list, create, update, delete")
	}
}

func (handler *Handler) createTask(ctx context.Context, traceID string, payload taskAPIRequest) (any, error) {
	title := strings.TrimSpace(payload.Title)
	if title == "" {
		return nil, validationError("task title is required")
	}
	if !isValidStatus(payload.Status) {
		return nil, validationError("task status must be todo, doing, or done")
	}

	now := handler.clock().UTC().Format(time.RFC3339Nano)
	task, err := handler.store.CreateTask(ctx, TaskRecord{
		ID:        handler.idFactory(),
		Title:     title,
		Status:    payload.Status,
		CreatedAt: now,
	})
	if err != nil {
		return nil, fmt.Errorf("persist task: %w", err)
	}
	if err := handler.publish(ctx, traceID, "task.created", task); err != nil {
		return nil, fmt.Errorf("publish task event: %w", err)
	}
	return map[string]any{"task": task}, nil
}

func (handler *Handler) updateTask(ctx context.Context, traceID string, payload taskAPIRequest) (any, error) {
	taskID := strings.TrimSpace(payload.TaskID)
	if taskID == "" {
		return nil, validationError("taskId is required")
	}
	if payload.Changes == nil || (!payload.Changes.hasTitle() && payload.Changes.Status == nil) {
		return nil, validationError("changes must include title or status")
	}
	if payload.Changes.hasTitle() && strings.TrimSpace(*payload.Changes.Title) == "" {
		return nil, validationError("task title is required")
	}
	if payload.Changes.Status != nil && !isValidStatus(*payload.Changes.Status) {
		return nil, validationError("task status must be todo, doing, or done")
	}

	updatedAt := handler.clock().UTC().Format(time.RFC3339Nano)
	task, err := handler.store.UpdateTask(ctx, taskID, *payload.Changes, updatedAt)
	if err != nil {
		return nil, err
	}
	if err := handler.publish(ctx, traceID, "task.updated", task); err != nil {
		return nil, fmt.Errorf("publish task event: %w", err)
	}
	return map[string]any{"task": task}, nil
}

func (handler *Handler) deleteTask(ctx context.Context, traceID string, payload taskAPIRequest) (any, error) {
	taskID := strings.TrimSpace(payload.TaskID)
	if taskID == "" {
		return nil, validationError("taskId is required")
	}

	task, err := handler.store.DeleteTask(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if err := handler.publish(ctx, traceID, "task.deleted", task); err != nil {
		return nil, fmt.Errorf("publish task event: %w", err)
	}
	return map[string]any{"deletedTaskId": task.ID}, nil
}

func (handler *Handler) publish(ctx context.Context, traceID string, eventType string, task TaskRecord) error {
	return handler.publisher.PublishTaskEvent(ctx, TaskEventEnvelope{
		TraceID: traceID,
		Payload: TaskEventPayload{
			Channel:   TaskEventsChannel,
			EventType: eventType,
			Task:      task,
		},
	})
}

type InMemoryStore struct {
	mutex sync.RWMutex
	tasks []TaskRecord
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{}
}

func (store *InMemoryStore) ListTasks(ctx context.Context) ([]TaskRecord, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	store.mutex.RLock()
	defer store.mutex.RUnlock()

	tasks := make([]TaskRecord, len(store.tasks))
	copy(tasks, store.tasks)
	return tasks, nil
}

func (store *InMemoryStore) CreateTask(ctx context.Context, task TaskRecord) (TaskRecord, error) {
	if err := ctx.Err(); err != nil {
		return TaskRecord{}, err
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	store.tasks = append(store.tasks, task)
	return task, nil
}

func (store *InMemoryStore) UpdateTask(ctx context.Context, taskID string, changes TaskChanges, updatedAt string) (TaskRecord, error) {
	if err := ctx.Err(); err != nil {
		return TaskRecord{}, err
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	for index, task := range store.tasks {
		if task.ID != taskID {
			continue
		}
		if changes.hasTitle() {
			task.Title = strings.TrimSpace(*changes.Title)
		}
		if changes.Status != nil {
			task.Status = *changes.Status
		}
		task.UpdatedAt = updatedAt
		store.tasks[index] = task
		return task, nil
	}

	return TaskRecord{}, ErrNotFound
}

func (store *InMemoryStore) DeleteTask(ctx context.Context, taskID string) (TaskRecord, error) {
	if err := ctx.Err(); err != nil {
		return TaskRecord{}, err
	}

	store.mutex.Lock()
	defer store.mutex.Unlock()

	for index, task := range store.tasks {
		if task.ID != taskID {
			continue
		}
		store.tasks = append(store.tasks[:index], store.tasks[index+1:]...)
		return task, nil
	}

	return TaskRecord{}, ErrNotFound
}

type NopEventPublisher struct{}

func (NopEventPublisher) PublishTaskEvent(ctx context.Context, envelope TaskEventEnvelope) error {
	return ctx.Err()
}

type taskAPIRequest struct {
	Channel   string       `json:"channel"`
	Operation string       `json:"operation"`
	Title     string       `json:"title"`
	Status    TaskStatus   `json:"status"`
	TaskID    string       `json:"taskId"`
	Changes   *TaskChanges `json:"changes"`
}

func (changes TaskChanges) hasTitle() bool {
	return changes.Title != nil
}

func isValidStatus(status TaskStatus) bool {
	return status == StatusTodo || status == StatusDoing || status == StatusDone
}

func validationError(message string) error {
	return fmt.Errorf("%w: %s", ErrValidation, message)
}

func setJSONHeaders(response http.ResponseWriter) {
	response.Header().Set("Content-Type", "application/json")
	response.Header().Set("Access-Control-Allow-Origin", "*")
	response.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
	response.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
}

func writeJSON(response http.ResponseWriter, status int, body any) {
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(body)
}

func writeError(response http.ResponseWriter, traceID string, status int, message string) {
	writeJSON(response, status, map[string]any{
		"traceId": traceID,
		"payload": map[string]string{
			"error": message,
		},
	})
}

func newTaskID() string {
	var bytes [8]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return fmt.Sprintf("task-%d", time.Now().UnixNano())
	}
	return "task-" + hex.EncodeToString(bytes[:])
}
