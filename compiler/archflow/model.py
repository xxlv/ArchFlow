from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Diagnostic:
    severity: str
    message: str
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "severity": self.severity,
            "message": self.message,
        }
        if self.line is not None:
            result["line"] = self.line
        return result


@dataclass
class FlowNode:
    kind: str
    value: str

    def to_dict(self) -> dict[str, str]:
        return {"kind": self.kind, "value": self.value}


@dataclass
class ExceptionFlow:
    name: str
    sequence: list[FlowNode] = field(default_factory=list)
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "sequence": [node.to_dict() for node in self.sequence],
        }
        if self.line is not None:
            result["line"] = self.line
        return result


@dataclass
class Workflow:
    name: str
    sequence: list[FlowNode] = field(default_factory=list)
    exceptions: list[ExceptionFlow] = field(default_factory=list)
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "sequence": [node.to_dict() for node in self.sequence],
            "exceptions": [flow.to_dict() for flow in self.exceptions],
        }
        if self.line is not None:
            result["line"] = self.line
        return result


@dataclass
class Component:
    name: str
    explicit: bool = False
    attributes: dict[str, str] = field(default_factory=dict)
    workflows: list[Workflow] = field(default_factory=list)
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "name": self.name,
            "explicit": self.explicit,
            "attributes": self.attributes,
            "workflows": [workflow.to_dict() for workflow in self.workflows],
        }
        if self.line is not None:
            result["line"] = self.line
        return result


@dataclass
class Channel:
    source: str
    via: str
    target: str
    schema: str | None = None
    line: int | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "source": self.source,
            "via": self.via,
            "target": self.target,
        }
        if self.schema:
            result["schema"] = self.schema
        if self.line is not None:
            result["line"] = self.line
        return result


@dataclass
class ArchFlowAst:
    version: str = "0.1"
    attributes: dict[str, str] = field(default_factory=dict)
    components: dict[str, Component] = field(default_factory=dict)
    channels: list[Channel] = field(default_factory=list)
    diagnostics: list[Diagnostic] = field(default_factory=list)

    def ensure_component(self, name: str, *, explicit: bool, line: int | None = None) -> Component:
        component = self.components.get(name)
        if component is None:
            component = Component(name=name, explicit=explicit, line=line)
            self.components[name] = component
            return component

        if explicit:
            component.explicit = True
            component.line = line
        return component

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "system": {
                "attributes": self.attributes,
            },
            "components": [self.components[name].to_dict() for name in sorted(self.components)],
            "channels": [channel.to_dict() for channel in self.channels],
            "diagnostics": [diagnostic.to_dict() for diagnostic in self.diagnostics],
        }
