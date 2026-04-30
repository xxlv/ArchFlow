package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	taskbackend "task-backend/src/taskbackend"
)

func TestTaskAPIWorkflow(t *testing.T) {
	fixedTime := time.Date(2026, 4, 30, 3, 45, 0, 0, time.UTC)

	tests := []struct {
		name       string
		request    map[string]any
		wantStatus int
		wantError  string
		assert     func(t *testing.T, response map[string]any, publisher *capturingPublisher)
	}{
		{
			name: "creates a task and emits Task_Events",
			request: map[string]any{
				"traceId": "trace-create",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "create",
					"title":     "  Write focused tests  ",
					"status":    "todo",
				},
			},
			wantStatus: http.StatusOK,
			assert: func(t *testing.T, response map[string]any, publisher *capturingPublisher) {
				payload := requirePayload(t, response)
				task := requireTask(t, payload["task"])
				if task["id"] != "task-1" {
					t.Fatalf("task id = %v, want task-1", task["id"])
				}
				if task["title"] != "Write focused tests" {
					t.Fatalf("task title = %v, want trimmed title", task["title"])
				}
				if task["createdAt"] != fixedTime.Format(time.RFC3339Nano) {
					t.Fatalf("createdAt = %v, want fixed time", task["createdAt"])
				}
				if len(publisher.events) != 1 {
					t.Fatalf("events = %d, want 1", len(publisher.events))
				}
				event := publisher.events[0]
				if event.TraceID != "trace-create" || event.Payload.Channel != taskbackend.TaskEventsChannel || event.Payload.EventType != "task.created" {
					t.Fatalf("unexpected event: %#v", event)
				}
			},
		},
		{
			name: "rejects invalid input",
			request: map[string]any{
				"traceId": "trace-invalid",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "create",
					"title":     " ",
					"status":    "todo",
				},
			},
			wantStatus: http.StatusBadRequest,
			wantError:  "validation failed: task title is required",
		},
		{
			name: "lists persisted tasks",
			request: map[string]any{
				"traceId": "trace-list",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "list",
				},
			},
			wantStatus: http.StatusOK,
			assert: func(t *testing.T, response map[string]any, publisher *capturingPublisher) {
				payload := requirePayload(t, response)
				tasks, ok := payload["tasks"].([]any)
				if !ok {
					t.Fatalf("payload.tasks = %#v, want array", payload["tasks"])
				}
				if len(tasks) != 1 {
					t.Fatalf("tasks = %d, want 1", len(tasks))
				}
			},
		},
		{
			name: "updates a task and emits Task_Events",
			request: map[string]any{
				"traceId": "trace-update",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "update",
					"taskId":    "task-1",
					"changes": map[string]any{
						"status": "done",
					},
				},
			},
			wantStatus: http.StatusOK,
			assert: func(t *testing.T, response map[string]any, publisher *capturingPublisher) {
				payload := requirePayload(t, response)
				task := requireTask(t, payload["task"])
				if task["status"] != "done" {
					t.Fatalf("task status = %v, want done", task["status"])
				}
				if len(publisher.events) != 2 {
					t.Fatalf("events = %d, want 2", len(publisher.events))
				}
				event := publisher.events[1]
				if event.TraceID != "trace-update" || event.Payload.EventType != "task.updated" {
					t.Fatalf("unexpected update event: %#v", event)
				}
			},
		},
		{
			name: "deletes a task and emits Task_Events",
			request: map[string]any{
				"traceId": "trace-delete",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "delete",
					"taskId":    "task-1",
				},
			},
			wantStatus: http.StatusOK,
			assert: func(t *testing.T, response map[string]any, publisher *capturingPublisher) {
				payload := requirePayload(t, response)
				if payload["deletedTaskId"] != "task-1" {
					t.Fatalf("deletedTaskId = %v, want task-1", payload["deletedTaskId"])
				}
				if len(publisher.events) != 3 {
					t.Fatalf("events = %d, want 3", len(publisher.events))
				}
				event := publisher.events[2]
				if event.TraceID != "trace-delete" || event.Payload.EventType != "task.deleted" {
					t.Fatalf("unexpected delete event: %#v", event)
				}
				if event.Payload.Task.ID != "task-1" {
					t.Fatalf("deleted event task id = %v, want task-1", event.Payload.Task.ID)
				}
			},
		},
		{
			name: "lists zero tasks after delete",
			request: map[string]any{
				"traceId": "trace-list-empty",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "list",
				},
			},
			wantStatus: http.StatusOK,
			assert: func(t *testing.T, response map[string]any, publisher *capturingPublisher) {
				payload := requirePayload(t, response)
				tasks, ok := payload["tasks"].([]any)
				if !ok {
					t.Fatalf("payload.tasks = %#v, want array", payload["tasks"])
				}
				if len(tasks) != 0 {
					t.Fatalf("tasks = %d, want 0", len(tasks))
				}
			},
		},
		{
			name: "rejects delete without taskId",
			request: map[string]any{
				"traceId": "trace-delete-invalid",
				"payload": map[string]any{
					"channel":   taskbackend.TaskAPIChannel,
					"operation": "delete",
					"taskId":    " ",
				},
			},
			wantStatus: http.StatusBadRequest,
			wantError:  "validation failed: taskId is required",
		},
	}

	store := taskbackend.NewInMemoryStore()
	publisher := &capturingPublisher{}
	handler := taskbackend.NewHandler(
		store,
		publisher,
		taskbackend.WithClock(func() time.Time { return fixedTime }),
		taskbackend.WithIDFactory(func() string { return "task-1" }),
	)

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, jsonRequest(t, test.request))

			if recorder.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d; body = %s", recorder.Code, test.wantStatus, recorder.Body.String())
			}

			response := decodeResponse(t, recorder)
			if test.wantError != "" {
				payload := requirePayload(t, response)
				if payload["error"] != test.wantError {
					t.Fatalf("error = %v, want %q", payload["error"], test.wantError)
				}
			}
			if test.assert != nil {
				test.assert(t, response, publisher)
			}
		})
	}
}

func jsonRequest(t *testing.T, body map[string]any) *http.Request {
	t.Helper()

	encoded, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, taskbackend.TaskAPIEndpoint, bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")
	return request
}

func decodeResponse(t *testing.T, recorder *httptest.ResponseRecorder) map[string]any {
	t.Helper()

	var response map[string]any
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return response
}

func requirePayload(t *testing.T, response map[string]any) map[string]any {
	t.Helper()

	payload, ok := response["payload"].(map[string]any)
	if !ok {
		t.Fatalf("payload = %#v, want object", response["payload"])
	}
	return payload
}

func requireTask(t *testing.T, value any) map[string]any {
	t.Helper()

	task, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("task = %#v, want object", value)
	}
	return task
}

type capturingPublisher struct {
	events []taskbackend.TaskEventEnvelope
}

func (publisher *capturingPublisher) PublishTaskEvent(ctx context.Context, envelope taskbackend.TaskEventEnvelope) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	publisher.events = append(publisher.events, envelope)
	return nil
}
