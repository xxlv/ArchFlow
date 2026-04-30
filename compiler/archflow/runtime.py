from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .model import ArchFlowAst, Channel, Component, Diagnostic


@dataclass(frozen=True)
class RuntimeExposure:
    channel: str
    transport: str
    method: str
    path: str
    component: str


@dataclass(frozen=True)
class RuntimeUse:
    channel: str
    profile: str
    mode: str
    value: str
    component: str


@dataclass(frozen=True)
class RuntimePort:
    component: str
    profile: str
    port: int


def runtime_manifest(ast: ArchFlowAst) -> dict[str, Any]:
    """Build a structured runtime assembly view from component attributes."""

    exposures = _collect_exposures(ast)
    uses = _collect_uses(ast)
    ports = _collect_ports(ast)
    profiles = sorted({port.profile for port in ports} | {use.profile for use in uses})

    return {
        "profiles": {
            profile: _profile_manifest(ast, profile, exposures=exposures, uses=uses, ports=ports)
            for profile in profiles
        }
    }


def validate_runtime(ast: ArchFlowAst) -> list[Diagnostic]:
    diagnostics: list[Diagnostic] = []
    channels_by_name = _channels_by_name(ast)
    profiles_by_port: dict[tuple[str, int], str] = {}

    for component in ast.components.values():
        for key, value in component.attributes.items():
            if key.startswith("Runtime.Port."):
                profile = key.removeprefix("Runtime.Port.").strip()
                if not profile:
                    diagnostics.append(Diagnostic("error", f"Runtime port on @{component.name} must include a profile suffix"))
                    continue
                try:
                    port = int(value)
                except ValueError:
                    diagnostics.append(Diagnostic("error", f"Runtime port for @{component.name} profile {profile} must be an integer"))
                    continue
                if port <= 0 or port > 65535:
                    diagnostics.append(Diagnostic("error", f"Runtime port for @{component.name} profile {profile} must be between 1 and 65535"))
                    continue
                conflict_key = (profile, port)
                if conflict_key in profiles_by_port:
                    diagnostics.append(
                        Diagnostic(
                            "error",
                            f"Runtime port {port} in profile {profile} is used by both @{profiles_by_port[conflict_key]} and @{component.name}",
                        )
                    )
                profiles_by_port[conflict_key] = component.name
            elif key.startswith("Expose."):
                channel_name = key.removeprefix("Expose.").strip()
                if channel_name not in channels_by_name:
                    diagnostics.append(Diagnostic("error", f"@{component.name} exposes unknown channel [{channel_name}]"))
                    continue
                if not any(channel.target == component.name for channel in channels_by_name[channel_name]):
                    diagnostics.append(Diagnostic("error", f"@{component.name} can only expose inbound channel [{channel_name}]"))
                if _parse_exposure(component.name, channel_name, value) is None:
                    diagnostics.append(Diagnostic("error", f"Expose.{channel_name} on @{component.name} must look like 'REST_JSON POST /path'"))
            elif key.startswith("Use."):
                parsed = _parse_use_key(component.name, key, value)
                if parsed is None:
                    diagnostics.append(Diagnostic("error", f"Use binding on @{component.name} must look like .Use.<Channel>.<profile>: mode:value"))
                    continue
                if parsed.channel not in channels_by_name:
                    diagnostics.append(Diagnostic("error", f"@{component.name} uses unknown channel [{parsed.channel}]"))
                    continue
                if not any(channel.source == component.name for channel in channels_by_name[parsed.channel]):
                    diagnostics.append(Diagnostic("error", f"@{component.name} can only use outbound channel [{parsed.channel}]"))

    standard = ast.attributes.get("Standard", "")
    if standard == "REST_JSON" and _has_runtime_metadata(ast):
        exposures = _collect_exposures(ast)
        uses = _collect_uses(ast)
        for channel in ast.channels:
            if channel.via not in exposures:
                diagnostics.append(Diagnostic("warning", f"REST_JSON channel [{channel.via}] has no .Expose.{channel.via} runtime endpoint"))
            if not any(use.channel == channel.via and use.component == channel.source for use in uses):
                diagnostics.append(Diagnostic("warning", f"REST_JSON channel [{channel.via}] has no .Use.{channel.via}.<profile> runtime binding"))

    return diagnostics


def _has_runtime_metadata(ast: ArchFlowAst) -> bool:
    for component in ast.components.values():
        for key in component.attributes:
            if key.startswith("Runtime.") or key.startswith("Expose.") or key.startswith("Use."):
                return True
    return False


def _profile_manifest(
    ast: ArchFlowAst,
    profile: str,
    *,
    exposures: dict[str, RuntimeExposure],
    uses: list[RuntimeUse],
    ports: list[RuntimePort],
) -> dict[str, Any]:
    modules: dict[str, dict[str, Any]] = {}
    for port in ports:
        if port.profile == profile:
            modules.setdefault(port.component, {})["port"] = port.port

    channel_entries: dict[str, dict[str, Any]] = {}
    for channel in ast.channels:
        exposure = exposures.get(channel.via)
        use = next((candidate for candidate in uses if candidate.profile == profile and candidate.component == channel.source and candidate.channel == channel.via), None)
        if exposure is None and use is None:
            continue

        entry: dict[str, Any] = {
            "source": channel.source,
            "target": channel.target,
            "via": channel.via,
        }
        if exposure is not None:
            entry["endpoint"] = {
                "component": exposure.component,
                "transport": exposure.transport,
                "method": exposure.method,
                "path": exposure.path,
            }
        if use is not None:
            binding: dict[str, Any] = {
                "component": use.component,
                "mode": use.mode,
                "value": use.value,
            }
            if use.mode == "proxy":
                binding["path"] = use.value
                target_port = modules.get(channel.target, {}).get("port")
                if target_port is not None:
                    binding["target"] = f"http://localhost:{target_port}"
            entry["binding"] = binding
        channel_entries[channel.via] = entry

    return {
        "modules": modules,
        "channels": channel_entries,
    }


def _collect_exposures(ast: ArchFlowAst) -> dict[str, RuntimeExposure]:
    exposures: dict[str, RuntimeExposure] = {}
    for component in ast.components.values():
        for key, value in component.attributes.items():
            if not key.startswith("Expose."):
                continue
            channel_name = key.removeprefix("Expose.").strip()
            exposure = _parse_exposure(component.name, channel_name, value)
            if exposure is not None:
                exposures[channel_name] = exposure
    return exposures


def _collect_uses(ast: ArchFlowAst) -> list[RuntimeUse]:
    uses: list[RuntimeUse] = []
    for component in ast.components.values():
        for key, value in component.attributes.items():
            if key.startswith("Use."):
                parsed = _parse_use_key(component.name, key, value)
                if parsed is not None:
                    uses.append(parsed)
    return uses


def _collect_ports(ast: ArchFlowAst) -> list[RuntimePort]:
    ports: list[RuntimePort] = []
    for component in ast.components.values():
        for key, value in component.attributes.items():
            if not key.startswith("Runtime.Port."):
                continue
            try:
                port = int(value)
            except ValueError:
                continue
            ports.append(RuntimePort(component=component.name, profile=key.removeprefix("Runtime.Port.").strip(), port=port))
    return ports


def _channels_by_name(ast: ArchFlowAst) -> dict[str, list[Channel]]:
    result: dict[str, list[Channel]] = {}
    for channel in ast.channels:
        result.setdefault(channel.via, []).append(channel)
    return result


def _parse_exposure(component_name: str, channel_name: str, value: str) -> RuntimeExposure | None:
    parts = value.split()
    if len(parts) != 3:
        return None
    transport, method, path = parts
    if not transport or not method or not path.startswith("/"):
        return None
    return RuntimeExposure(
        channel=channel_name,
        transport=transport,
        method=method.upper(),
        path=path,
        component=component_name,
    )


def _parse_use_key(component_name: str, key: str, value: str) -> RuntimeUse | None:
    parts = key.split(".")
    if len(parts) != 3 or parts[0] != "Use":
        return None
    channel_name = parts[1].strip()
    profile = parts[2].strip()
    if not channel_name or not profile or ":" not in value:
        return None
    mode, binding_value = value.split(":", 1)
    mode = mode.strip()
    binding_value = binding_value.strip()
    if not mode or not binding_value:
        return None
    return RuntimeUse(channel=channel_name, profile=profile, mode=mode, value=binding_value, component=component_name)
