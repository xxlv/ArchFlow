from __future__ import annotations

from collections import defaultdict

from .model import ArchFlowAst, Diagnostic
from .runtime import validate_runtime


def validate_ast(ast: ArchFlowAst) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    diagnostics.extend(_validate_components(ast))
    diagnostics.extend(_validate_channels(ast))
    diagnostics.extend(_validate_workflows(ast))
    diagnostics.extend(_validate_cycles(ast))
    diagnostics.extend(validate_runtime(ast))
    return diagnostics


def _validate_components(ast: ArchFlowAst) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for component in ast.components.values():
        if not component.explicit:
            diagnostics.append(
                Diagnostic(
                    "warning",
                    f"Component @{component.name} is only declared as a channel endpoint and has no module block",
                    component.line,
                )
            )
            continue
        if "Stack" not in component.attributes:
            diagnostics.append(Diagnostic("warning", f"Component @{component.name} has no .Stack attribute", component.line))
    return diagnostics


def _validate_channels(ast: ArchFlowAst) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    seen: set[tuple[str, str, str]] = set()
    for channel in ast.channels:
        key = (channel.source, channel.via, channel.target)
        if key in seen:
            diagnostics.append(Diagnostic("warning", f"Duplicate channel @{channel.source} => [{channel.via}] => @{channel.target}", channel.line))
        seen.add(key)

        if channel.source not in ast.components:
            diagnostics.append(Diagnostic("error", f"Channel source @{channel.source} is not defined", channel.line))
        if channel.target not in ast.components:
            diagnostics.append(Diagnostic("error", f"Channel target @{channel.target} is not defined", channel.line))
        if not channel.schema:
            diagnostics.append(Diagnostic("warning", f"Channel [{channel.via}] has no .Schema.{channel.via} contract", channel.line))
    return diagnostics


def _validate_workflows(ast: ArchFlowAst) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    for component in ast.components.values():
        workflow_names: set[str] = set()
        for workflow in component.workflows:
            if workflow.name in workflow_names:
                diagnostics.append(Diagnostic("warning", f"Duplicate workflow ${workflow.name} in @{component.name}", workflow.line))
            workflow_names.add(workflow.name)
            if not workflow.sequence:
                diagnostics.append(Diagnostic("warning", f"Workflow ${workflow.name} in @{component.name} has no main sequence", workflow.line))
    return diagnostics


def _validate_cycles(ast: ArchFlowAst) -> list[Diagnostic]:
    graph: dict[str, list[str]] = defaultdict(list)
    line_by_edge: dict[tuple[str, str], int | None] = {}
    for channel in ast.channels:
        graph[channel.source].append(channel.target)
        line_by_edge[(channel.source, channel.target)] = channel.line

    visited: set[str] = set()
    active: set[str] = set()
    diagnostics: list[Diagnostic] = []

    def visit(node: str, path: list[str]) -> None:
        if node in active:
            cycle = path[path.index(node) :] + [node]
            diagnostics.append(Diagnostic("warning", f"Channel graph contains a cycle: {' -> '.join(cycle)}", line_by_edge.get((path[-1], node))))
            return
        if node in visited:
            return
        active.add(node)
        for child in graph.get(node, []):
            visit(child, path + [child])
        active.remove(node)
        visited.add(node)

    for component_name in ast.components:
        visit(component_name, [component_name])
    return diagnostics
