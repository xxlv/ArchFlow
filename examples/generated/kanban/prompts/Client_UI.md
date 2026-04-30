# ArchFlow Module Prompt: @Client_UI

## Context
- System: TaskBoard
- Standard: REST_JSON
- Stack: React

## Boundary
This component is isolated. It may only communicate through the inbound and outbound contracts listed below.

## Inbound Contracts
- None

## Outbound Contracts
- [Task_API] to @Task_Backend
  - Schema: Client sends task create/list/update requests as JSON over HTTP.
  - Envelope: JSON object with traceId:string and payload:TaskApiPayload.
  - Operations: list -> { channel:"Task_API", operation:"list" }; create -> { channel:"Task_API", operation:"create", title:string, status:"todo"|"doing"|"done" }; update -> { channel:"Task_API", operation:"update", taskId:string, changes:{ title?:string, status?:"todo"|"doing"|"done" } }.
  - Responses: list returns { tasks:TaskRecord[] }; create/update return { task:TaskRecord }; errors return { error:string } inside payload.
  - TaskRecord: { id:string, title:string, status:"todo"|"doing"|"done", createdAt:string, updatedAt?:string }.

## Runtime Assembly
- Profile `dev` port: `5173`
- Uses [Task_API] in profile `dev`: `proxy:/task-api`

## Internal Workflows
- $Task_Interaction: state:Viewing_Board >> action:Submit_New_Task >> action:Render_Task_List >> state:Board_Updated
  - ! Request_Failed: action:Show_Error_Message >> state:Viewing_Board

## Implementation Instructions
You are implementing one isolated ArchFlow component.

Rules:
- Only use data from the contracts explicitly listed in this prompt.
- Do not import or reference internals from other components.
- Treat every `=>` channel as a physical boundary.
- Keep business logic inside this component unless a contract says otherwise.
- Include focused unit tests for the component boundary.

TypeScript guidance:
- Prefer explicit interfaces for inbound and outbound channel payloads.
- Keep side effects behind small adapter functions.
- Use async/await for boundary calls.
- Avoid global mutable state.

## Output Contract
Return code for this module only. Do not implement other modules or hidden cross-module dependencies.
