# ArchFlow v1.0 Language Specification

Chinese version: [`SPEC.md`](SPEC.md)

## 1. Core Philosophy

- **Contract-first DSL**: declare cross-module contracts before generating module implementations. Contracts are the shared boundary for AI task sharding, mocks, stubs, and runtime assembly.
- **Sketch-first modeling**: draw the outline first (`@`), then the connections (`$`), then the details (`.`).
- **Physical isolation**: modules are transparent to each other by default unless a channel (`=>`) is explicitly defined.
- **AI-friendly**: high symbol density with minimal token overhead.

---

## 2. Grammar System

### A. Entity Definitions

| Symbol      | Name          | Semantics                                                  |
| :---------- | :------------ | :--------------------------------------------------------- |
| **`@`**     | **Component** | An independent physical or logical unit, such as a service, frontend app, or agent. |
| **`%`**     | **Resource**  | External infrastructure, such as a database, hardware device, or third-party API. |
| **`[` `]`** | **Action**    | A concrete function, processing step, or atomic operation inside a module. |
| **`(` `)`** | **State**     | The current state of a system or data item, such as `Idle`, `Pending`, or `Success`. |

### B. Connections and Topology

| Symbol     | Name                 | Semantics                                                  |
| :--------- | :------------------- | :--------------------------------------------------------- |
| **`>>`**   | **Internal Flow**    | Sequential logic or function calls inside a module. |
| **`=>`**   | **Isolated Channel** | The only physical channel allowed between modules. It enforces decoupling and must define a schema. |
| **`&`**    | **Parallel**         | Tasks that execute in parallel. |
| **`~`**    | **Inference**        | A node that involves AI model inference or fuzzy processing. |

### C. Logic Control

| Symbol    | Name          | Semantics                                                  |
| :-------- | :------------ | :--------------------------------------------------------- |
| **`$`**   | **Workflow**  | A persistent loop, lifecycle, or primary business flow. |
| **`?`**   | **Condition** | A logical branch, such as if-then-else. |
| **`!`**   | **Exception** | Error handling, interruption, or rollback logic. |

### D. Metadata

| Symbol    | Name          | Semantics                                                  |
| :-------- | :------------ | :--------------------------------------------------------- |
| **`.`**   | **Attribute** | Technology stack, version, or constraints, such as `.Stack: Rust`. |
| **`#`**   | **Comment**   | Notes for humans or architect agents. |

Contract-first semantics are expressed through the attribute system. ArchFlow does not introduce a separate contract syntax block:

- `.Schema.<Channel>: <description>` binds an interface contract description to a `=> [Channel] =>`. Every cross-module channel must have a matching schema.
- `.Standard: <standard>` declares the default protocol or format used when interpreting and generating contracts, such as `REST_JSON`.
- `.Stack: <stack>` declares a module implementation stack. It must not change the cross-module boundary fixed by `.Schema`.

Runtime assembly is still expressed through the attribute system. ArchFlow does not introduce a separate profile syntax block:

- `.Runtime.Port.<profile>: <port>` declares a module port for a runtime environment.
- `.Expose.<Channel>: <transport> <method> <path>` declares how a target module exposes an inbound channel.
- `.Use.<Channel>.<profile>: <mode>:<value>` declares how a source module connects to an outbound channel in a runtime environment.

Profile names such as `dev`, `test`, and `prod` come from attribute suffixes and become first-class runtime models in the compiled `runtime.json` artifact.

---

## 3. Layering Rules

ArchFlow uses indentation to express depth:

1. **L1 (Root)**: describes global `@Modules` and the `=>` channels between them.
2. **L2 (Module SDL)**: describes each module's `$Workflow` and core `[Actions]`.
3. **L3 (Detail)**: describes `[Action]` input/output schemas and concrete algorithms.

Contracts have higher priority than implementation details: `.Schema.<Channel>` fixes the input/output semantics of a channel, and a module's internal `$Workflow` may only consume or produce data allowed by those contracts. The compiler should validate channel schemas before generating module prompts, mocks, stubs, and runtime assembly metadata.

---

## 4. Example: Standard Description File

```archflow
# Global architecture description
.System: API_Publish_Platform
.Standard: REST_JSON
.Schema.HTTPS/Auth: Authenticated publish request with title, body, author token, and publish target.
.Schema.Redis_PubSub: Publish event message with article ID, publication status, and sync command.

# L1: outline and isolated channels
@Client_UI => [HTTPS/Auth] => @Manager_Backend
@Manager_Backend => [Redis_PubSub] => @Gateway_Sync_Worker

# L2: module details
@Manager_Backend:
  .Stack: Node.js/TypeScript
  $Publish_Flow:
    [Req_Validate] >> [DB_Save] >> [Push_To_Channel]
    ! On_Error >> [Log] >> (Fail_Response)

@Gateway_Sync_Worker:
  .Stack: Go
  $Listen_Loop:
    (Idle) >> [Wait_Channel] >> [Apply_To_Nginx]
    ! Auth_Fail >> [Alert]
```

---

## 5. Compilation Instructions for AI Architects

When giving this file to an AI agent, include the following instructions:

> **Instructions:**
>
> 1. **Parse**: read the ArchFlow text and build a dependency graph.
> 2. **Validate contracts**: ensure every `=> [Channel] =>` has a matching `.Schema.<Channel>`, and treat the schema as the only cross-module data boundary.
> 3. **Expand**: convert each `[Action]` into pseudocode logic, and each `.Schema` into an interface contract, mock, and stub.
> 4. **Shard**: generate `N` isolated prompts, one for each module. Each prompt must include that module's metadata `.`, internal workflow `$SQL`, and inbound/outbound contracts.
> 5. **Enforce isolation**: when generating sharded tasks, never reference external variables that are not allowed by a contract.

---

## 6. Extensibility Notes

- **Custom symbols**: users may temporarily define symbols in `.Extensions`, such as `*` for broadcast.
- **Version control**: this specification is `v1.0`. Future versions may support compatibility declarations through `.Version`.
