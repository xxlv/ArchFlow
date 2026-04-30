package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"

	taskbackend "task-backend/src/taskbackend"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	handler := taskbackend.NewHandler(
		taskbackend.NewInMemoryStore(),
		logEventPublisher{},
	)

	mux := http.NewServeMux()
	mux.Handle(taskbackend.TaskAPIEndpoint, handler)

	log.Printf("@Task_Backend listening on :%s%s", port, taskbackend.TaskAPIEndpoint)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}

type logEventPublisher struct{}

func (logEventPublisher) PublishTaskEvent(ctx context.Context, envelope taskbackend.TaskEventEnvelope) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	body, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	log.Printf("Task_Events %s", string(body))
	return nil
}
