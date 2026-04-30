---
name: archflow-af-author
description: Create and refine ArchFlow .af architecture files from product requirements, module ideas, or system descriptions. Use when the user asks to design an ArchFlow file, create an .af file, convert requirements into ArchFlow DSL, define modules, channels, workflows, contracts, or scaffold-ready architecture.
---

# ArchFlow AF Author

## Purpose

Use this skill to create or revise `.af` files for ArchFlow. The goal is to turn a product/system requirement into a contract-first architecture description that can pass `archflow validate`, `archflow build`, and `archflow scaffold`.

## Authoring Workflow

1. Identify the system name and standard:
   - `.System: <Name>`
   - `.Standard: REST_JSON`, `EVENT_JSON`, `GRPC`, or another explicit protocol.

2. Identify isolated modules:
   - Use `@Module_Name:` for every independently developed component.
   - Prefer stable domain names: `@Client_UI`, `@Manager_Backend`, `@Gateway_Sync_Worker`.

3. Define physical channels before internals:
   - Use `@A => [Channel_Name] => @B`.
   - Every channel must have a matching `.Schema.<Channel_Name>: <description>`.
   - Do not imply communication without a `=>` channel.

4. Define each module block:
   - Add `.Stack: <tech stack>` inside every module.
   - Add one or more `$Workflow:` blocks.
   - Use `[Action] >> [Action]` for sequential logic.
   - Use `(State)` for important states.
   - Use `! Error_Name >> [Action] >> (State)` for error or interruption flow.

5. Keep module internals isolated:
   - A module may mention external modules only through inbound/outbound channels.
   - Put cross-module data shape in `.Schema.<Channel_Name>`, not inside module internals.

6. Validate generated syntax:
   - Indentation is two spaces per level.
   - Root level: `.System`, `.Standard`, `.Schema.*`, channel definitions, module headers.
   - Module level: `.Stack`, `$Workflow:`.
   - Workflow level: action/state/error flow lines.

## Output Template

Use this structure:

```archflow
# Global architecture description
.System: <System_Name>
.Standard: <Protocol_Standard>
.Schema.<Channel_Name>: <Contract description>

# L1: outline and isolated channels
@Source_Module => [Channel_Name] => @Target_Module

# L2: module internals
@Source_Module:
  .Stack: <Tech Stack>
  $Main_Flow:
    [First_Action] >> [Second_Action] >> (Done_State)
    ! Error_Name >> [Recovery_Action] >> (Failed_State)

@Target_Module:
  .Stack: <Tech Stack>
  $Main_Flow:
    (Idle) >> [Receive_Input] >> [Process] >> (Done)
```

## Quality Checklist

Before finalizing an `.af` file, check:

- Every `@Module` used in a channel has a module block.
- Every module block has `.Stack`.
- Every `=> [Channel] =>` has `.Schema.<Channel>`.
- Every workflow has at least one main sequence.
- Error flows use `!`.
- Actions use `[Action_Name]`.
- States use `(State_Name)`.
- No module relies on another module's internal actions.

## Validation Commands

If working inside this repository, run:

```bash
PYTHONPATH=compiler python3 -m archflow.cli validate examples/<file>.af
PYTHONPATH=compiler python3 -m archflow.cli build examples/<file>.af --registry registry
PYTHONPATH=compiler python3 -m archflow.cli scaffold examples/<file>.af --registry registry
```

If validation fails, fix the `.af` source first, then regenerate outputs.
