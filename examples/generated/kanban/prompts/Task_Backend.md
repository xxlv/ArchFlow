# ArchFlow Module Prompt: @Task_Backend

## Context
- System: TaskBoard
- Standard: REST_JSON
- Stack: Go

## Boundary
This component is isolated. It may only communicate through the inbound and outbound contracts listed below.

## Inbound Contracts
- [Task_API] from @Client_UI
  - Schema: Client sends task create/list/update requests as JSON over HTTP.
  - Envelope: JSON object with traceId:string and payload:TaskApiPayload.
  - Operations: list -> { channel:"Task_API", operation:"list" }; create -> { channel:"Task_API", operation:"create", title:string, status:"todo"|"doing"|"done" }; update -> { channel:"Task_API", operation:"update", taskId:string, changes:{ title?:string, status?:"todo"|"doing"|"done" } }.
  - Responses: list returns { tasks:TaskRecord[] }; create/update return { task:TaskRecord }; errors return { error:string } inside payload.
  - TaskRecord: { id:string, title:string, status:"todo"|"doing"|"done", createdAt:string, updatedAt?:string }.

## Outbound Contracts
- [Task_Events] to @Notification_Worker
  - Schema: Backend emits task lifecycle events as JSON messages.
  - Envelope: JSON object with traceId:string and payload:TaskEventPayload.
  - Payload: { channel:"Task_Events", eventType:string, task:TaskRecord }.

## Runtime Assembly
- Profile `dev` port: `8080`
- Exposes [Task_API]: `REST_JSON POST /task-api`
- Uses [Task_Events] in profile `dev`: `webhook:/task-events`

## Internal Workflows
- $Task_API_Flow: state:Idle >> action:Receive_Task_Request >> action:Validate_Input >> action:Persist_Task >> action:Return_Response >> state:Request_Handled
  - ! Invalid_Input: action:Return_Validation_Error >> state:Request_Rejected
  - ! Storage_Error: action:Return_Server_Error >> state:Request_Failed

## Implementation Instructions
You are implementing one isolated ArchFlow component.

Rules:
- Only use data from the contracts explicitly listed in this prompt.
- Do not import or reference internals from other components.
- Treat every `=>` channel as a physical boundary.
- Keep business logic inside this component unless a contract says otherwise.
- Include focused unit tests for the component boundary.

Go guidance:
- Keep channel payloads in small structs with JSON tags.
- Pass dependencies through constructors.
- Return errors explicitly at boundary operations.
- Prefer table-driven tests for workflow actions.

## Output Contract
Return code for this module only. Do not implement other modules or hidden cross-module dependencies.
