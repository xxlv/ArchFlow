from __future__ import annotations

import json
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .contracts import contract_id, contracts_manifest, dumps_json
from .generator import _component_base_dir, _slugify
from .model import ArchFlowAst, Channel
from .parser import parse_file
from .prompts import compile_all_prompts, compile_module_prompt
from .runtime import runtime_manifest
from .validator import validate_ast


@dataclass(frozen=True)
class ChangeRecord:
    category: str
    summary: str
    affected_modules: tuple[str, ...]
    old: Any = None
    new: Any = None

    def to_dict(self) -> dict[str, Any]:
        result = {
            "category": self.category,
            "summary": self.summary,
            "affectedModules": list(self.affected_modules),
        }
        if self.old is not None:
            result["old"] = self.old
        if self.new is not None:
            result["new"] = self.new
        return result


def write_snapshot(
    ast: ArchFlowAst,
    source_path: str | Path,
    output_dir: str | Path,
    registry_dir: str | Path | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    out = Path(output_dir)
    prompts_dir = out / "prompts"
    prompts_dir.mkdir(parents=True, exist_ok=True)

    source = Path(source_path)
    (out / "source.af").write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    (out / "ast.json").write_text(dumps_json(ast.to_dict()), encoding="utf-8")
    (out / "contracts.json").write_text(dumps_json(contracts_manifest(ast)), encoding="utf-8")
    (out / "runtime.json").write_text(dumps_json(runtime_manifest(ast)), encoding="utf-8")
    if metadata is not None:
        (out / "metadata.json").write_text(dumps_json(metadata), encoding="utf-8")
    for name, prompt in compile_all_prompts(ast, registry_dir).items():
        (prompts_dir / f"{name}.md").write_text(prompt, encoding="utf-8")


def save_baseline_snapshot(
    ast: ArchFlowAst,
    source_path: str | Path,
    workspace_dir: str | Path,
    registry_dir: str | Path | None = None,
    *,
    event: str,
    snapshot_id: str | None = None,
    append_history: bool = True,
) -> Path:
    workspace = Path(workspace_dir)
    archflow_dir = workspace / ".archflow"
    snapshot_id = snapshot_id or _unique_history_id(archflow_dir / "snapshots")
    timestamped_dir = archflow_dir / "snapshots" / snapshot_id
    created_at = _utc_now_iso()
    metadata = {
        "id": snapshot_id,
        "event": event,
        "source": str(source_path),
        "createdAt": created_at,
    }

    write_snapshot(ast, source_path, timestamped_dir, registry_dir, metadata=metadata)
    _copy_directory(timestamped_dir, archflow_dir / "snapshots" / "current")
    if append_history:
        _append_history(
            workspace,
            {
                "event": event,
                "snapshot": snapshot_id,
                "source": str(source_path),
                "createdAt": created_at,
            },
        )
    return timestamped_dir


def plan_change(
    source_path: str | Path,
    workspace_dir: str | Path,
    registry_dir: str | Path | None = None,
    change_id: str | None = None,
) -> Path:
    workspace = Path(workspace_dir)
    archflow_dir = workspace / ".archflow"
    current_snapshot = archflow_dir / "snapshots" / "current"
    baseline_source = current_snapshot / "source.af"
    if not baseline_source.exists():
        raise FileNotFoundError(f"No baseline snapshot found at {baseline_source}. Run scaffold or accept-change first.")

    old_ast = _parse_and_validate(baseline_source)
    new_ast = _parse_and_validate(source_path)
    changes = diff_architectures(old_ast, new_ast)

    actual_change_id = change_id or _unique_history_id(archflow_dir / "changes")
    out = archflow_dir / "changes" / actual_change_id
    created_at = _utc_now_iso()
    from_snapshot = _snapshot_id(current_snapshot)
    status = {
        "id": actual_change_id,
        "status": "planned",
        "fromSnapshot": from_snapshot,
        "toSnapshot": None,
        "createdAt": created_at,
        "acceptedAt": None,
    }
    _write_change_outputs(out, baseline_source, Path(source_path), old_ast, new_ast, changes, registry_dir, status)
    latest_dir = archflow_dir / "changes" / "latest"
    if out != latest_dir:
        _copy_directory(out, latest_dir)
    _append_history(
        workspace,
        {
            "event": "plan-change",
            "change": actual_change_id,
            "fromSnapshot": from_snapshot,
            "source": str(source_path),
            "createdAt": created_at,
        },
    )
    return out


def accept_change(source_path: str | Path, workspace_dir: str | Path, registry_dir: str | Path | None = None) -> Path:
    workspace = Path(workspace_dir)
    ast = _parse_and_validate(source_path)
    snapshot_dir = save_baseline_snapshot(ast, source_path, workspace, registry_dir, event="accept-change", append_history=False)
    _mark_latest_change_accepted(workspace, snapshot_dir.name)
    return snapshot_dir


def diff_architectures(old_ast: ArchFlowAst, new_ast: ArchFlowAst) -> list[ChangeRecord]:
    changes: list[ChangeRecord] = []
    changes.extend(_diff_channels(old_ast, new_ast))
    changes.extend(_diff_contracts(old_ast, new_ast))
    changes.extend(_diff_runtime(old_ast, new_ast))
    changes.extend(_diff_components(old_ast, new_ast))
    return changes


def _parse_and_validate(source_path: str | Path) -> ArchFlowAst:
    ast = parse_file(source_path)
    ast.diagnostics.extend(validate_ast(ast))
    errors = [diagnostic for diagnostic in ast.diagnostics if diagnostic.severity == "error"]
    if errors:
        messages = "; ".join(diagnostic.message for diagnostic in errors)
        raise ValueError(f"Cannot create architecture change plan: {messages}")
    return ast


def _write_change_outputs(
    out: Path,
    old_source: Path,
    new_source: Path,
    old_ast: ArchFlowAst,
    new_ast: ArchFlowAst,
    changes: list[ChangeRecord],
    registry_dir: str | Path | None,
    status: dict[str, Any] | None = None,
) -> None:
    (out / "modules").mkdir(parents=True, exist_ok=True)
    (out / "contracts").mkdir(parents=True, exist_ok=True)

    (out / "source.old.af").write_text(old_source.read_text(encoding="utf-8"), encoding="utf-8")
    (out / "source.new.af").write_text(new_source.read_text(encoding="utf-8"), encoding="utf-8")
    if status is not None:
        (out / "status.json").write_text(dumps_json(status), encoding="utf-8")
    (out / "summary.md").write_text(_render_summary(changes), encoding="utf-8")
    (out / "affected-modules.json").write_text(dumps_json(_affected_modules_payload(new_ast, changes)), encoding="utf-8")

    for channel_name, records in _contract_change_groups(changes).items():
        (out / "contracts" / f"{_slugify(channel_name)}.diff.md").write_text(_render_contract_diff(channel_name, records), encoding="utf-8")

    for module_name, records in _records_by_module(changes).items():
        component = new_ast.components.get(module_name) or old_ast.components.get(module_name)
        if component is None:
            continue
        module_dir = out / "modules" / _slugify(module_name)
        module_dir.mkdir(parents=True, exist_ok=True)
        target_prompt = compile_module_prompt(new_ast, module_name, registry_dir) if module_name in new_ast.components else ""
        (module_dir / "PATCH_PROMPT.md").write_text(_render_patch_prompt(module_name, records, target_prompt), encoding="utf-8")


def _diff_channels(old_ast: ArchFlowAst, new_ast: ArchFlowAst) -> list[ChangeRecord]:
    old_channels = _channels_by_id(old_ast)
    new_channels = _channels_by_id(new_ast)
    changes: list[ChangeRecord] = []

    for key in sorted(new_channels.keys() - old_channels.keys()):
        channel = new_channels[key]
        changes.append(
            ChangeRecord(
                category="channel.added",
                summary=f"Added channel @{channel['source']} => [{channel['via']}] => @{channel['target']}.",
                affected_modules=_unique(channel["source"], channel["target"]),
                new=channel,
            )
        )
    for key in sorted(old_channels.keys() - new_channels.keys()):
        channel = old_channels[key]
        changes.append(
            ChangeRecord(
                category="channel.removed",
                summary=f"Removed channel @{channel['source']} => [{channel['via']}] => @{channel['target']}.",
                affected_modules=_unique(channel["source"], channel["target"]),
                old=channel,
            )
        )
    return changes


def _diff_contracts(old_ast: ArchFlowAst, new_ast: ArchFlowAst) -> list[ChangeRecord]:
    old_contracts = contracts_manifest(old_ast)
    new_contracts = contracts_manifest(new_ast)
    changes: list[ChangeRecord] = []

    for key in sorted(old_contracts.keys() & new_contracts.keys()):
        old_contract = old_contracts[key]
        new_contract = new_contracts[key]
        if old_contract == new_contract:
            continue
        changes.append(
            ChangeRecord(
                category="contract.changed",
                summary=f"Changed contract [{new_contract['via']}].",
                affected_modules=_unique(new_contract["source"], new_contract["target"]),
                old=_contract_summary(old_contract),
                new=_contract_summary(new_contract),
            )
        )
    return changes


def _diff_runtime(old_ast: ArchFlowAst, new_ast: ArchFlowAst) -> list[ChangeRecord]:
    old_runtime = runtime_manifest(old_ast)
    new_runtime = runtime_manifest(new_ast)
    changes: list[ChangeRecord] = []

    old_profiles = old_runtime.get("profiles", {})
    new_profiles = new_runtime.get("profiles", {})
    for profile in sorted(set(old_profiles) | set(new_profiles)):
        old_profile = old_profiles.get(profile, {})
        new_profile = new_profiles.get(profile, {})
        changes.extend(_diff_runtime_modules(profile, old_profile.get("modules", {}), new_profile.get("modules", {})))
        changes.extend(_diff_runtime_channels(profile, old_profile.get("channels", {}), new_profile.get("channels", {})))
    return changes


def _diff_components(old_ast: ArchFlowAst, new_ast: ArchFlowAst) -> list[ChangeRecord]:
    changes: list[ChangeRecord] = []
    old_components = old_ast.components
    new_components = new_ast.components

    for name in sorted(new_components.keys() - old_components.keys()):
        changes.append(ChangeRecord("module.added", f"Added module @{name}.", (name,), new=new_components[name].to_dict()))
    for name in sorted(old_components.keys() - new_components.keys()):
        changes.append(ChangeRecord("module.removed", f"Removed module @{name}.", (name,), old=old_components[name].to_dict()))

    for name in sorted(old_components.keys() & new_components.keys()):
        old_component = old_components[name]
        new_component = new_components[name]
        old_attrs = _implementation_attributes(old_component.attributes)
        new_attrs = _implementation_attributes(new_component.attributes)
        if old_attrs != new_attrs:
            changes.append(ChangeRecord("module.attributes.changed", f"Changed attributes for @{name}.", (name,), old=old_attrs, new=new_attrs))
        old_workflows = [workflow.to_dict() for workflow in old_component.workflows]
        new_workflows = [workflow.to_dict() for workflow in new_component.workflows]
        if old_workflows != new_workflows:
            changes.append(ChangeRecord("workflow.changed", f"Changed workflows for @{name}.", (name,), old=old_workflows, new=new_workflows))
    return changes


def _diff_runtime_modules(profile: str, old_modules: dict[str, Any], new_modules: dict[str, Any]) -> list[ChangeRecord]:
    changes: list[ChangeRecord] = []
    for module_name in sorted(set(old_modules) | set(new_modules)):
        old_value = old_modules.get(module_name)
        new_value = new_modules.get(module_name)
        if old_value == new_value:
            continue
        changes.append(
            ChangeRecord(
                "runtime.module.changed",
                f"Changed runtime module settings for @{module_name} in profile {profile}.",
                (module_name,),
                old=old_value,
                new=new_value,
            )
        )
    return changes


def _diff_runtime_channels(profile: str, old_channels: dict[str, Any], new_channels: dict[str, Any]) -> list[ChangeRecord]:
    changes: list[ChangeRecord] = []
    for channel_name in sorted(set(old_channels) | set(new_channels)):
        old_value = old_channels.get(channel_name)
        new_value = new_channels.get(channel_name)
        if old_value == new_value:
            continue
        affected = _unique(
            *(value for value in [
                _nested(old_value, "source"),
                _nested(old_value, "target"),
                _nested(new_value, "source"),
                _nested(new_value, "target"),
            ] if isinstance(value, str))
        )
        changes.append(
            ChangeRecord(
                "runtime.channel.changed",
                f"Changed runtime binding for [{channel_name}] in profile {profile}.",
                affected,
                old=old_value,
                new=new_value,
            )
        )
    return changes


def _channels_by_id(ast: ArchFlowAst) -> dict[str, dict[str, Any]]:
    return {
        contract_id(channel): {
            "source": channel.source,
            "target": channel.target,
            "via": channel.via,
            "schema": channel.schema,
        }
        for channel in ast.channels
    }


def _contract_summary(contract: dict[str, Any]) -> dict[str, Any]:
    return {
        "via": contract["via"],
        "source": contract["source"],
        "target": contract["target"],
        "description": contract["schema"].get("description"),
        "details": contract.get("details", {}),
    }


def _implementation_attributes(attributes: dict[str, str]) -> dict[str, str]:
    return {
        key: value
        for key, value in sorted(attributes.items())
        if not key.startswith("Runtime.") and not key.startswith("Expose.") and not key.startswith("Use.")
    }


def _affected_modules_payload(ast: ArchFlowAst, changes: list[ChangeRecord]) -> dict[str, Any]:
    modules: dict[str, dict[str, Any]] = {}
    for module_name, records in _records_by_module(changes).items():
        component = ast.components.get(module_name)
        modules[module_name] = {
            "path": f"{_component_base_dir(component)}/{_slugify(module_name)}" if component else None,
            "changes": [record.to_dict() for record in records],
        }
    return {"modules": modules}


def _records_by_module(changes: list[ChangeRecord]) -> dict[str, list[ChangeRecord]]:
    records: dict[str, list[ChangeRecord]] = {}
    for change in changes:
        for module_name in change.affected_modules:
            records.setdefault(module_name, []).append(change)
    return records


def _contract_change_groups(changes: list[ChangeRecord]) -> dict[str, list[ChangeRecord]]:
    groups: dict[str, list[ChangeRecord]] = {}
    for change in changes:
        if not change.category.startswith("contract.") and not change.category.startswith("channel."):
            continue
        channel_name = _nested(change.new, "via") or _nested(change.old, "via")
        if isinstance(channel_name, str):
            groups.setdefault(channel_name, []).append(change)
    return groups


def _render_summary(changes: list[ChangeRecord]) -> str:
    lines = [
        "# ArchFlow Change Summary",
        "",
        "Use module `PATCH_PROMPT.md` files for existing code. Use full `ARCHFLOW_PROMPT.md` only for new modules or full rewrites.",
        "",
    ]
    if not changes:
        lines.append("No architecture changes detected.")
    else:
        lines.append("## Changes")
        lines.append("")
        for change in changes:
            modules = ", ".join(f"@{module}" for module in change.affected_modules) or "none"
            lines.append(f"- `{change.category}`: {change.summary} Affected: {modules}.")
    return "\n".join(lines) + "\n"


def _render_contract_diff(channel_name: str, records: list[ChangeRecord]) -> str:
    lines = [f"# Contract Diff: [{channel_name}]", ""]
    for record in records:
        lines.extend(
            [
                f"## {record.category}",
                "",
                record.summary,
                "",
                "### Old",
                "",
                "```json",
                dumps_json(record.old).rstrip(),
                "```",
                "",
                "### New",
                "",
                "```json",
                dumps_json(record.new).rstrip(),
                "```",
                "",
            ]
        )
    return "\n".join(lines)


def _render_patch_prompt(module_name: str, records: list[ChangeRecord], target_prompt: str) -> str:
    lines = [
        f"# ArchFlow Patch Prompt: @{module_name}",
        "",
        "You are updating an existing module after an ArchFlow architecture change.",
        "",
        "## Patch Rules",
        "- Make the smallest code changes required by this change set.",
        "- Preserve existing implementation, styling, tests, and behavior unless listed below.",
        "- Do not rewrite the whole module unless the user explicitly asks for a rewrite.",
        "- Keep cross-module communication limited to the channels listed in the target module prompt.",
        "",
        "## Change Set",
        "",
    ]
    if not records:
        lines.append("- No module-specific changes detected.")
    else:
        for record in records:
            lines.append(f"- `{record.category}`: {record.summary}")
    lines.extend(["", "## Change Details", ""])
    for record in records:
        lines.extend(
            [
                f"### {record.category}",
                "",
                record.summary,
                "",
                "Old:",
                "```json",
                dumps_json(record.old).rstrip(),
                "```",
                "",
                "New:",
                "```json",
                dumps_json(record.new).rstrip(),
                "```",
                "",
            ]
        )
    if target_prompt:
        lines.extend(["## Target Module Prompt", "", target_prompt.rstrip(), ""])
    return "\n".join(lines)


def _nested(value: Any, key: str) -> Any:
    return value.get(key) if isinstance(value, dict) else None


def _unique(*values: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(values))


def _timestamp_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _unique_history_id(parent: Path) -> str:
    base = _timestamp_id()
    candidate = base
    index = 2
    while (parent / candidate).exists():
        candidate = f"{base}-{index}"
        index += 1
    return candidate


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _copy_directory(source: Path, target: Path) -> None:
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)


def _append_history(workspace: Path, event: dict[str, Any]) -> None:
    history_path = workspace / ".archflow" / "history.jsonl"
    history_path.parent.mkdir(parents=True, exist_ok=True)
    with history_path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")


def _snapshot_id(snapshot_dir: Path) -> str:
    metadata_path = snapshot_dir / "metadata.json"
    if not metadata_path.exists():
        return snapshot_dir.name
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return snapshot_dir.name
    snapshot_id = metadata.get("id")
    return snapshot_id if isinstance(snapshot_id, str) else snapshot_dir.name


def _mark_latest_change_accepted(workspace: Path, snapshot_id: str) -> None:
    latest_status = workspace / ".archflow" / "changes" / "latest" / "status.json"
    if not latest_status.exists():
        _append_history(
            workspace,
            {
                "event": "accept-change",
                "snapshot": snapshot_id,
                "createdAt": _utc_now_iso(),
            },
        )
        return

    status = json.loads(latest_status.read_text(encoding="utf-8"))
    accepted_at = _utc_now_iso()
    status["status"] = "accepted"
    status["toSnapshot"] = snapshot_id
    status["acceptedAt"] = accepted_at

    latest_status.write_text(dumps_json(status), encoding="utf-8")
    change_id = status.get("id")
    if isinstance(change_id, str):
        timestamp_status = workspace / ".archflow" / "changes" / change_id / "status.json"
        if timestamp_status.exists():
            timestamp_status.write_text(dumps_json(status), encoding="utf-8")
    _append_history(
        workspace,
        {
            "event": "accept-change",
            "change": change_id,
            "snapshot": snapshot_id,
            "acceptedAt": accepted_at,
        },
    )
