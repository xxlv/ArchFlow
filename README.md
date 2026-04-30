# ArchFlow

ArchFlow is a contract-first DSL compiler for AI-generated modular systems.

The MVP focuses on one loop: parse an `.af` architecture file, validate its topology, and generate isolated module prompts with channel contracts, mocks, stubs, and an assembly sketch.

## What It Solves

AI can generate code quickly, but multi-module systems often drift because module boundaries, interface contracts, and shared context are not explicit enough. ArchFlow makes those boundaries explicit:

- `@Component` defines an isolated module.
- `=>` defines the only allowed cross-module channel.
- `.Schema.<Channel>` defines the contract for a channel.
- `$Workflow` defines internal module behavior.
- `.Stack` selects stack-specific implementation guidance.
- `.Runtime`, `.Expose`, and `.Use` attributes describe optional runtime assembly metadata.

## Current Scope

This is an MVP compiler, not a full runtime platform.

Included:

- Minimal `.af` parser
- AST JSON output
- Topology and contract diagnostics
- Module-scoped prompt generation
- JSON Schema contract generation
- Mock payload generation
- TypeScript contract and assembly stubs
- Runtime assembly manifest generation
- CLI commands for validation, build, scaffold, prompt rendering, and architecture change planning

Deferred:

- Cross-language runtime SDK
- Auto-Dockerizer
- Self-healing feedback loop
- Multi-model orchestration
- Custom symbol extension system

## Project Structure

```text
.
├── compiler/archflow      Python compiler package
├── examples               Example .af files and generated snapshots
├── playground             Static web playground for editing and visualizing .af files
├── registry               Base and stack-specific prompt templates
├── spec                   MVP grammar notes
├── tests                  Unit tests
├── LIST.md                Original project module notes
├── SPEC.md                ArchFlow language specification draft (Chinese)
├── SPEC.en.md             ArchFlow language specification draft (English)
└── module.md              Module prompt orchestration notes
```

## Quick Start

Use Python 3.10 or newer. The project currently has no runtime dependencies.

Run commands directly from the repository:

```bash
PYTHONPATH=compiler python3 -m archflow.cli validate examples/kanban.af
PYTHONPATH=compiler python3 -m archflow.cli build examples/kanban.af --registry registry
PYTHONPATH=compiler python3 -m archflow.cli scaffold examples/kanban.af --registry registry
PYTHONPATH=compiler python3 -m archflow.cli prompt examples/kanban.af --module Task_Backend --registry registry
```

Or install it in editable mode:

```bash
python3 -m pip install -e .
archflow validate examples/kanban.af
archflow build examples/kanban.af --registry registry
archflow scaffold examples/kanban.af --registry registry
archflow prompt examples/kanban.af --module Task_Backend --registry registry
```

Run the static playground:

```bash
cd playground
npm install
npm run dev
```

## Example Input

```archflow
# Task board architecture
.System: TaskBoard
.Standard: REST_JSON

.Schema.Task_API: Client sends task create/list/update/delete requests as JSON over HTTP.
.Schema.Task_Events: Backend emits task lifecycle events as JSON messages.

@Client_UI => [Task_API] => @Task_Backend
@Task_Backend => [Task_Events] => @Notification_Worker

@Task_Backend:
  .Stack: Go
  .Runtime.Port.dev: 8080
  .Expose.Task_API: REST_JSON POST /task-api
  .Use.Task_Events.dev: webhook:/task-events
  $Task_API_Flow:
    (Idle) >> [Receive_Task_Request] >> [Validate_Input] >> [Persist_Task] >> [Return_Response] >> (Request_Handled)
    ! Invalid_Input >> [Return_Validation_Error] >> (Request_Rejected)
```

See the complete example at `examples/kanban.af`.

## Generated Outputs

Running `build` writes outputs to `examples/generated/<source-name>` by default:

```text
examples/generated/kanban
├── ast.json
├── contracts.json
├── diagnostics.json
├── graph.mmd
├── runtime.json
├── contracts/*.schema.json
├── mocks/*.mock.json
├── prompts/*.md
└── stubs/typescript
    ├── assembly.ts
    └── contracts.ts
```

The generated prompts are intentionally module-scoped. For example, the `Task_Backend` prompt includes its stack, internal workflow, inbound `Task_API` contract, and outbound `Task_Events` contract, but it does not expose unrelated module internals.

Runtime assembly metadata is optional and generated from module attributes. For example, `.Runtime.Port.dev`, `.Expose.Task_API`, and `.Use.Task_Events.dev` are compiled into `runtime.json` profiles for local proxy or environment wiring.

## CLI Commands

Validate an `.af` file:

```bash
PYTHONPATH=compiler python3 -m archflow.cli validate examples/kanban.af
```

Print diagnostics as JSON:

```bash
PYTHONPATH=compiler python3 -m archflow.cli validate examples/kanban.af --json
```

Build all generated artifacts:

```bash
PYTHONPATH=compiler python3 -m archflow.cli build examples/kanban.af --registry registry
```

Build to a custom output directory:

```bash
PYTHONPATH=compiler python3 -m archflow.cli build examples/kanban.af --registry registry --out /tmp/archflow-build
```

Create a module development workspace:

```bash
PYTHONPATH=compiler python3 -m archflow.cli scaffold examples/kanban.af --registry registry
```

`scaffold` also saves the current `.af` source as the implemented architecture baseline under `.archflow/snapshots/current` and archives a timestamped snapshot under `.archflow/snapshots/<id>`.

Scaffold to a custom output directory:

```bash
PYTHONPATH=compiler python3 -m archflow.cli scaffold examples/kanban.af --registry registry --out /tmp/kanban-workspace
```

Render a single module prompt:

```bash
PYTHONPATH=compiler python3 -m archflow.cli prompt examples/kanban.af --module Task_Backend --registry registry
```

Plan an architecture change after editing the `.af` file:

```bash
PYTHONPATH=compiler python3 -m archflow.cli plan-change examples/kanban.af --workspace examples/scaffold/kanban --registry registry
```

This compares the edited `.af` against `.archflow/snapshots/current/source.af`, writes a timestamped change under `.archflow/changes/<id>`, and refreshes `.archflow/changes/latest` as the convenient pointer for module-level patch prompts.

Accept a verified change as the new implemented baseline:

```bash
PYTHONPATH=compiler python3 -m archflow.cli accept-change examples/kanban.af --workspace examples/scaffold/kanban --registry registry
```

## Scaffolded Workspace

Running `scaffold` writes a developer-facing workspace to `examples/scaffold/<source-name>` by default:

```text
examples/scaffold/kanban
├── README.md
├── apps/client-ui
│   ├── ARCHFLOW_PROMPT.md
│   ├── README.md
│   ├── docs/contracts.md
│   ├── src/.gitkeep
│   └── tests/.gitkeep
├── services/task-backend
│   └── ...
├── workers/notification-worker
│   └── ...
└── shared
    ├── ast.json
    ├── contracts.json
    ├── runtime.json
    ├── graph.mmd
    ├── contracts/*.schema.json
    ├── mocks/*.mock.json
    └── stubs/typescript
```

Use each module's `ARCHFLOW_PROMPT.md` directly to generate code inside that module's `src/` directory. Keep cross-module communication aligned with `shared/contracts` and use `shared/mocks` for parallel development.

For existing code, prefer change planning over rewriting from the full prompt. After editing an `.af` file, run `plan-change` and give the affected module's `.archflow/changes/latest/modules/<module>/PATCH_PROMPT.md` to an agent. After the patch is implemented and verified, run `accept-change` to promote the edited `.af` to the new baseline.

ArchFlow keeps a small evolution history in the scaffold workspace:

```text
.archflow/
├── history.jsonl
├── snapshots/
│   ├── current/
│   └── <snapshot-id>/
└── changes/
    ├── latest/
    └── <change-id>/
```

`current` and `latest` are convenience copies. Timestamped snapshot and change directories preserve history. `accept-change` marks the latest change as accepted and creates a new timestamped baseline snapshot.

## Supported MVP Syntax

Root level:

- `.Key: Value` defines system attributes.
- `.Schema.<Channel>: <description>` binds a contract description to a channel.
- `@A => [Channel] => @B` defines an isolated channel.
- `@Module:` starts a module definition block.

Module level:

- `.Stack: ...` defines implementation stack metadata.
- `.Runtime.Port.<profile>: <port>` defines a profile-specific module port.
- `.Expose.<Channel>: <transport> <method> <path>` maps an inbound channel to a runtime endpoint.
- `.Use.<Channel>.<profile>: <mode>:<value>` maps an outbound channel to a profile-specific runtime binding.
- `$Workflow:` starts a workflow block.

Workflow level:

- `[Action] >> [Action]` defines sequential internal flow.
- `! Name >> [Action] >> (State)` defines exception handling.

More details are in `spec/grammar.md`.

The higher-level language specification is available in Chinese at `SPEC.md` and in English at `SPEC.en.md`.

## Validation

Run the test suite:

```bash
PYTHONPATH=compiler python3 -m unittest discover -s tests
```

The current tests cover parsing, validation, module-scoped prompt generation, and build output creation.

## Design Principle

ArchFlow should first prove the compiler-contract-prompt loop before becoming a runtime platform. Runtime SDKs, Docker generation, and self-healing can be added later once the `.af` language and generated contracts are stable.
