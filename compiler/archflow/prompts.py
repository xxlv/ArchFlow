from __future__ import annotations

from pathlib import Path

from .contract_details import contract_details_for_channel
from .model import ArchFlowAst, Channel, Component, FlowNode


def compile_module_prompt(ast: ArchFlowAst, module_name: str, registry_dir: str | Path | None = None) -> str:
    component = ast.components.get(module_name)
    if component is None:
        raise KeyError(f"Unknown component: {module_name}")

    inbound = [channel for channel in ast.channels if channel.target == module_name]
    outbound = [channel for channel in ast.channels if channel.source == module_name]
    registry = _load_registry(component, registry_dir)

    sections = [
        f"# ArchFlow Module Prompt: @{component.name}",
        "",
        "## Context",
        f"- System: {ast.attributes.get('System', 'Unknown')}",
        f"- Standard: {ast.attributes.get('Standard', 'Unspecified')}",
        f"- Stack: {component.attributes.get('Stack', 'Unspecified')}",
        "",
        "## Boundary",
        "This component is isolated. It may only communicate through the inbound and outbound contracts listed below.",
        "",
        "## Inbound Contracts",
        _format_channels(ast, inbound, direction="inbound"),
        "",
        "## Outbound Contracts",
        _format_channels(ast, outbound, direction="outbound"),
        "",
        "## Runtime Assembly",
        _format_runtime(component, inbound, outbound),
        "",
        "## Internal Workflows",
        _format_workflows(component),
        "",
        "## Implementation Instructions",
        registry,
        "",
        "## Output Contract",
        "Return code for this module only. Do not implement other modules or hidden cross-module dependencies.",
    ]
    return "\n".join(sections).rstrip() + "\n"


def compile_all_prompts(ast: ArchFlowAst, registry_dir: str | Path | None = None) -> dict[str, str]:
    return {
        name: compile_module_prompt(ast, name, registry_dir)
        for name, component in sorted(ast.components.items())
        if component.explicit
    }


def _format_channels(ast: ArchFlowAst, channels: list[Channel], *, direction: str) -> str:
    if not channels:
        return "- None"
    lines: list[str] = []
    for channel in channels:
        peer = channel.source if direction == "inbound" else channel.target
        peer_label = "from" if direction == "inbound" else "to"
        lines.append(f"- [{channel.via}] {peer_label} @{peer}")
        lines.append(f"  - Schema: {channel.schema or 'MISSING: define .Schema.' + channel.via}")
        for key, value in contract_details_for_channel(ast, channel).items():
            lines.append(f"  - {key}: {value}")
    return "\n".join(lines)


def _format_runtime(component: Component, inbound: list[Channel], outbound: list[Channel]) -> str:
    lines: list[str] = []

    for key, value in sorted(component.attributes.items()):
        if key.startswith("Runtime.Port."):
            profile = key.removeprefix("Runtime.Port.")
            lines.append(f"- Profile `{profile}` port: `{value}`")

    for channel in inbound:
        exposure = component.attributes.get(f"Expose.{channel.via}")
        if exposure:
            lines.append(f"- Exposes [{channel.via}]: `{exposure}`")

    for channel in outbound:
        prefix = f"Use.{channel.via}."
        for key, value in sorted(component.attributes.items()):
            if key.startswith(prefix):
                profile = key.removeprefix(prefix)
                lines.append(f"- Uses [{channel.via}] in profile `{profile}`: `{value}`")

    return "\n".join(lines) if lines else "- No runtime binding metadata declared."


def _format_workflows(component: Component) -> str:
    if not component.workflows:
        return "- No workflows defined."

    lines: list[str] = []
    for workflow in component.workflows:
        lines.append(f"- ${workflow.name}: {_format_sequence(workflow.sequence)}")
        for exception in workflow.exceptions:
            lines.append(f"  - ! {exception.name}: {_format_sequence(exception.sequence)}")
    return "\n".join(lines)


def _format_sequence(sequence: list[FlowNode]) -> str:
    if not sequence:
        return "(empty)"
    return " >> ".join(f"{node.kind}:{node.value}" for node in sequence)


def _load_registry(component: Component, registry_dir: str | Path | None) -> str:
    if registry_dir is None:
        registry_dir = Path.cwd() / "registry"
    registry_path = Path(registry_dir)

    blocks: list[str] = []
    default_path = registry_path / "default.md"
    if default_path.exists():
        blocks.append(default_path.read_text(encoding="utf-8").strip())

    stack = component.attributes.get("Stack", "").lower()
    stack_names = []
    if "typescript" in stack or "node" in stack or "react" in stack:
        stack_names.append("typescript")
    if stack == "go" or "go/" in stack or "/go" in stack:
        stack_names.append("go")

    for stack_name in stack_names:
        stack_path = registry_path / "stacks" / f"{stack_name}.md"
        if stack_path.exists():
            blocks.append(stack_path.read_text(encoding="utf-8").strip())

    return "\n\n".join(blocks) if blocks else "Follow the component boundary and contracts exactly."
