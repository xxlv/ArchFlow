# ArchFlow Module Prompt: @Notification_Worker

## Context
- System: TaskBoard
- Standard: REST_JSON
- Stack: Python

## Boundary
This component is isolated. It may only communicate through the inbound and outbound contracts listed below.

## Inbound Contracts
- [Task_Events] from @Task_Backend
  - Schema: Backend emits task lifecycle events as JSON messages.
  - Envelope: JSON object with traceId:string and payload:TaskEventPayload.
  - Payload: { channel:"Task_Events", eventType:string, task:TaskRecord }.

## Outbound Contracts
- None

## Runtime Assembly
- Profile `dev` port: `8090`
- Exposes [Task_Events]: `EVENT_JSON POST /task-events`

## Internal Workflows
- $Notify_On_Task_Event: state:Waiting >> action:Receive_Task_Event >> action:Build_Notification >> action:Send_Notification >> state:Notification_Sent
  - ! Delivery_Failed: action:Record_Retry >> state:Retry_Pending

## Implementation Instructions
You are implementing one isolated ArchFlow component.

Rules:
- Only use data from the contracts explicitly listed in this prompt.
- Do not import or reference internals from other components.
- Treat every `=>` channel as a physical boundary.
- Keep business logic inside this component unless a contract says otherwise.
- Include focused unit tests for the component boundary.

## Output Contract
Return code for this module only. Do not implement other modules or hidden cross-module dependencies.
