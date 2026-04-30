from __future__ import annotations

import re
from pathlib import Path

from .model import ArchFlowAst, Channel, Diagnostic, ExceptionFlow, FlowNode, Workflow

ATTR_RE = re.compile(r"^\.(?P<key>[^:]+):\s*(?P<value>.*)$")
CHANNEL_RE = re.compile(r"^@(?P<source>[A-Za-z_][\w]*)\s*=>\s*\[(?P<via>[^\]]+)\]\s*=>\s*@(?P<target>[A-Za-z_][\w]*)$")
COMPONENT_RE = re.compile(r"^@(?P<name>[A-Za-z_][\w]*):?$")
WORKFLOW_RE = re.compile(r"^\$(?P<name>[A-Za-z_][\w]*):$")
EXCEPTION_RE = re.compile(r"^!\s*(?P<name>[A-Za-z_][\w]*)\s*(?P<tail>>>.*)?$")


class ParseError(ValueError):
    """Raised when a source file cannot be read before parsing begins."""


def parse_file(path: str | Path) -> ArchFlowAst:
    source_path = Path(path)
    try:
        return parse_text(source_path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ParseError(f"Unable to read {source_path}: {exc}") from exc


def parse_text(text: str) -> ArchFlowAst:
    ast = ArchFlowAst()
    current_component: str | None = None
    current_workflow: Workflow | None = None

    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        indent = len(raw_line) - len(raw_line.lstrip(" "))
        if "\t" in raw_line[:indent]:
            ast.diagnostics.append(Diagnostic("error", "Tabs are not supported for indentation", line_no))
            continue
        if indent % 2 != 0:
            ast.diagnostics.append(Diagnostic("error", "Indentation must use multiples of two spaces", line_no))
            continue

        if indent == 0:
            current_component = None
            current_workflow = None
            current_component = _parse_root_line(ast, stripped, line_no)
        elif indent == 2:
            current_workflow = None
            if current_component is None:
                ast.diagnostics.append(Diagnostic("error", "Module-level line appears outside a component block", line_no))
                continue
            _parse_component_line(ast, current_component, stripped, line_no)
            component = ast.components[current_component]
            current_workflow = component.workflows[-1] if component.workflows else None
        elif indent == 4:
            if current_component is None or current_workflow is None:
                ast.diagnostics.append(Diagnostic("error", "Workflow line appears outside a workflow block", line_no))
                continue
            _parse_workflow_line(ast, current_workflow, stripped, line_no)
        else:
            ast.diagnostics.append(Diagnostic("error", "Only root, module, and workflow indentation levels are supported", line_no))

    _bind_channel_schemas(ast)
    return ast


def _parse_root_line(ast: ArchFlowAst, line: str, line_no: int) -> str | None:
    attr = ATTR_RE.match(line)
    if attr:
        ast.attributes[attr.group("key").strip()] = attr.group("value").strip()
        return None

    channel = CHANNEL_RE.match(line)
    if channel:
        source = channel.group("source")
        target = channel.group("target")
        ast.ensure_component(source, explicit=False, line=line_no)
        ast.ensure_component(target, explicit=False, line=line_no)
        ast.channels.append(Channel(source=source, via=channel.group("via").strip(), target=target, line=line_no))
        return None

    component = COMPONENT_RE.match(line)
    if component:
        ast.ensure_component(component.group("name"), explicit=True, line=line_no)
        return component.group("name")

    ast.diagnostics.append(Diagnostic("error", f"Unsupported root syntax: {line}", line_no))
    return None


def _parse_component_line(ast: ArchFlowAst, component_name: str, line: str, line_no: int) -> None:
    component = ast.components[component_name]
    attr = ATTR_RE.match(line)
    if attr:
        component.attributes[attr.group("key").strip()] = attr.group("value").strip()
        return

    workflow = WORKFLOW_RE.match(line)
    if workflow:
        component.workflows.append(Workflow(name=workflow.group("name"), line=line_no))
        return

    ast.diagnostics.append(Diagnostic("error", f"Unsupported component syntax: {line}", line_no))


def _parse_workflow_line(ast: ArchFlowAst, workflow: Workflow, line: str, line_no: int) -> None:
    exception = EXCEPTION_RE.match(line)
    if exception:
        tail = exception.group("tail") or ""
        workflow.exceptions.append(
            ExceptionFlow(
                name=exception.group("name"),
                sequence=_parse_sequence(tail.removeprefix(">>").strip()),
                line=line_no,
            )
        )
        return

    sequence = _parse_sequence(line)
    if sequence:
        workflow.sequence.extend(sequence)
        return

    ast.diagnostics.append(Diagnostic("error", f"Unsupported workflow syntax: {line}", line_no))


def _parse_sequence(value: str) -> list[FlowNode]:
    nodes: list[FlowNode] = []
    for part in [piece.strip() for piece in value.split(">>") if piece.strip()]:
        nodes.append(_parse_flow_node(part))
    return nodes


def _parse_flow_node(value: str) -> FlowNode:
    if value.startswith("[") and value.endswith("]"):
        return FlowNode(kind="action", value=value[1:-1].strip())
    if value.startswith("(") and value.endswith(")"):
        return FlowNode(kind="state", value=value[1:-1].strip())
    if value.startswith("?"):
        return FlowNode(kind="condition", value=value[1:].strip())
    if value.startswith("~"):
        return FlowNode(kind="inference", value=value[1:].strip())
    return FlowNode(kind="raw", value=value)


def _bind_channel_schemas(ast: ArchFlowAst) -> None:
    for channel in ast.channels:
        schema_key = f"Schema.{channel.via}"
        channel.schema = ast.attributes.get(schema_key)
