# ArchFlow MVP Grammar

This MVP implements the contract-first subset needed to compile an `.af` file into:

- AST JSON
- topology diagnostics
- channel contracts
- runtime assembly metadata
- module prompts
- mock/stub/assembly skeletons

## Supported Syntax

```archflow
.System: API_Publish_Platform
.Standard: REST_JSON
.Schema.HTTPS/Auth: Authenticated publish request

@Client_UI => [HTTPS/Auth] => @Manager_Backend

@Manager_Backend:
  .Stack: Node.js/TypeScript
  .Runtime.Port.dev: 8080
  .Expose.HTTPS/Auth: REST_JSON POST /publish
  $Publish_Flow:
    [Req_Validate] >> [DB_Save] >> [Push_To_Channel]
    ! On_Error >> [Log] >> (Fail_Response)
```

## Root Level

- `.Key: Value` defines system attributes.
- `.Schema.<Channel>: <description>` binds a contract description to a channel.
- `@A => [Channel] => @B` defines an isolated channel.
- `@Module:` starts a module definition block.

## Module Level

- `.Stack: ...` defines implementation stack metadata.
- `.Runtime.Port.<profile>: <port>` defines the module port for a runtime profile.
- `.Expose.<Channel>: <transport> <method> <path>` maps an inbound channel to a target endpoint.
- `.Use.<Channel>.<profile>: <mode>:<value>` maps an outbound channel to a profile-specific binding.
- `$Workflow:` starts a workflow block.

Runtime profile names such as `dev`, `test`, and `prod` are parsed from attribute suffixes. They are first-class in generated `runtime.json`, but not standalone grammar blocks in the MVP syntax.

## Workflow Level

- `[Action] >> [Action]` defines sequential internal flow.
- `! Name >> [Action] >> (State)` defines exception handling.

## AST Shape

The compiler emits a JSON object with:

- `version`
- `system.attributes`
- `components[]`
- `channels[]`
- `runtime.json` output generated from runtime attributes
- `diagnostics[]`

Components can be explicit (`@Module:` block) or implicit (first seen as a channel endpoint).
