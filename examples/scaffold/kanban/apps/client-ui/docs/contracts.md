# @Client_UI Contracts

Use these channel contracts as the only cross-module boundary.

## outbound: [Task_API]

- Source: `@Client_UI`
- Target: `@Task_Backend`
- Schema file: `../../../shared/contracts/Client_UI__Task_API__Task_Backend.schema.json`
- Mock file: `../../../shared/mocks/Client_UI__Task_API__Task_Backend.mock.json`
- Description: Client sends task create/list/update/delete requests as JSON over HTTP.
- Envelope: JSON object with traceId:string and payload:TaskApiPayload.
- Operations: list -> { channel:"Task_API", operation:"list" }; create -> { channel:"Task_API", operation:"create", title:string, status:"todo"|"doing"|"done" }; update -> { channel:"Task_API", operation:"update", taskId:string, changes:{ title?:string, status?:"todo"|"doing"|"done" } }; delete -> { channel:"Task_API", operation:"delete", taskId:string }.
- Responses: list returns { tasks:TaskRecord[] }; create/update return { task:TaskRecord }; delete returns { deletedTaskId:string }; errors return { error:string } inside payload.
- TaskRecord: { id:string, title:string, status:"todo"|"doing"|"done", createdAt:string, updatedAt?:string }.
- Runtime binding (dev): `proxy:/task-api`
