# @Notification_Worker Contracts

Use these channel contracts as the only cross-module boundary.

## inbound: [Task_Events]

- Source: `@Task_Backend`
- Target: `@Notification_Worker`
- Schema file: `../../../shared/contracts/Task_Backend__Task_Events__Notification_Worker.schema.json`
- Mock file: `../../../shared/mocks/Task_Backend__Task_Events__Notification_Worker.mock.json`
- Description: Backend emits task lifecycle events as JSON messages.
- Envelope: JSON object with traceId:string and payload:TaskEventPayload.
- Payload: { channel:"Task_Events", eventType:string, task:TaskRecord }.
- Runtime endpoint: `EVENT_JSON POST /task-events`
