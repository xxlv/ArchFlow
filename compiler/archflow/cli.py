from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .evolution import accept_change, plan_change, save_baseline_snapshot
from .generator import build_outputs, scaffold_outputs
from .parser import parse_file
from .prompts import compile_module_prompt
from .validator import validate_ast


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="archflow", description="ArchFlow MVP compiler")
    subcommands = parser.add_subparsers(dest="command", required=True)

    validate_parser = subcommands.add_parser("validate", help="Parse and validate an .af file")
    validate_parser.add_argument("source")
    validate_parser.add_argument("--json", action="store_true", help="Print diagnostics as JSON")

    build_parser = subcommands.add_parser("build", help="Build AST, prompts, contracts, mocks, and stubs")
    build_parser.add_argument("source")
    build_parser.add_argument("--out", default=None, help="Output directory")
    build_parser.add_argument("--registry", default=None, help="Registry template directory")

    scaffold_parser = subcommands.add_parser("scaffold", help="Create a module development workspace")
    scaffold_parser.add_argument("source")
    scaffold_parser.add_argument("--out", default=None, help="Output directory")
    scaffold_parser.add_argument("--registry", default=None, help="Registry template directory")

    plan_change_parser = subcommands.add_parser("plan-change", help="Generate patch prompts from the saved baseline to a new .af file")
    plan_change_parser.add_argument("source")
    plan_change_parser.add_argument("--workspace", required=True, help="Scaffold workspace containing .archflow/snapshots/current")
    plan_change_parser.add_argument("--registry", default=None, help="Registry template directory")
    plan_change_parser.add_argument("--change-id", default=None, help="Change output folder name. Defaults to a UTC timestamp.")

    accept_change_parser = subcommands.add_parser("accept-change", help="Promote a validated .af file to the current scaffold baseline")
    accept_change_parser.add_argument("source")
    accept_change_parser.add_argument("--workspace", required=True, help="Scaffold workspace containing .archflow")
    accept_change_parser.add_argument("--registry", default=None, help="Registry template directory")

    prompt_parser = subcommands.add_parser("prompt", help="Print one module prompt")
    prompt_parser.add_argument("source")
    prompt_parser.add_argument("--module", required=True)
    prompt_parser.add_argument("--registry", default=None, help="Registry template directory")

    args = parser.parse_args(argv)
    if args.command == "validate":
        return _validate(args.source, as_json=args.json)
    if args.command == "build":
        return _build(args.source, args.out, args.registry)
    if args.command == "scaffold":
        return _scaffold(args.source, args.out, args.registry)
    if args.command == "plan-change":
        return _plan_change(args.source, args.workspace, args.registry, args.change_id)
    if args.command == "accept-change":
        return _accept_change(args.source, args.workspace, args.registry)
    if args.command == "prompt":
        return _prompt(args.source, args.module, args.registry)
    return 1


def _parse_and_validate(source: str):
    ast = parse_file(source)
    ast.diagnostics.extend(validate_ast(ast))
    return ast


def _validate(source: str, *, as_json: bool) -> int:
    ast = _parse_and_validate(source)
    diagnostics = [diagnostic.to_dict() for diagnostic in ast.diagnostics]
    errors = [diagnostic for diagnostic in ast.diagnostics if diagnostic.severity == "error"]

    if as_json:
        print(json.dumps({"diagnostics": diagnostics}, ensure_ascii=False, indent=2))
    elif not diagnostics:
        print(f"{source}: ok")
    else:
        for diagnostic in diagnostics:
            location = f":{diagnostic.line}" if diagnostic.line is not None else ""
            print(f"{source}{location}: {diagnostic.severity}: {diagnostic.message}")

    return 1 if errors else 0


def _build(source: str, out: str | None, registry: str | None) -> int:
    ast = _parse_and_validate(source)
    errors = [diagnostic for diagnostic in ast.diagnostics if diagnostic.severity == "error"]
    if errors:
        for diagnostic in errors:
            location = f":{diagnostic.line}" if diagnostic.line is not None else ""
            print(f"{source}{location}: error: {diagnostic.message}", file=sys.stderr)
        return 1

    source_path = Path(source)
    output_dir = Path(out) if out else source_path.parent / "generated" / source_path.stem
    build_outputs(ast, output_dir, registry_dir=registry)
    print(f"Built ArchFlow outputs in {output_dir}")
    return 0


def _scaffold(source: str, out: str | None, registry: str | None) -> int:
    ast = _parse_and_validate(source)
    errors = [diagnostic for diagnostic in ast.diagnostics if diagnostic.severity == "error"]
    if errors:
        for diagnostic in errors:
            location = f":{diagnostic.line}" if diagnostic.line is not None else ""
            print(f"{source}{location}: error: {diagnostic.message}", file=sys.stderr)
        return 1

    source_path = Path(source)
    output_dir = Path(out) if out else source_path.parent / "scaffold" / source_path.stem
    scaffold_outputs(ast, output_dir, registry_dir=registry)
    snapshot_dir = save_baseline_snapshot(ast, source_path, output_dir, registry_dir=registry, event="scaffold")
    print(f"Scaffolded ArchFlow workspace in {output_dir}")
    print(f"Saved ArchFlow baseline in {output_dir / '.archflow' / 'snapshots' / 'current'}")
    print(f"Archived ArchFlow snapshot in {snapshot_dir}")
    return 0


def _plan_change(source: str, workspace: str, registry: str | None, change_id: str) -> int:
    try:
        output_dir = plan_change(source, workspace, registry_dir=registry, change_id=change_id)
    except (FileNotFoundError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Planned ArchFlow change in {output_dir}")
    return 0


def _accept_change(source: str, workspace: str, registry: str | None) -> int:
    try:
        snapshot_dir = accept_change(source, workspace, registry_dir=registry)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(f"Accepted ArchFlow baseline in {snapshot_dir}")
    return 0


def _prompt(source: str, module: str, registry: str | None) -> int:
    ast = _parse_and_validate(source)
    errors = [diagnostic for diagnostic in ast.diagnostics if diagnostic.severity == "error"]
    if errors:
        for diagnostic in errors:
            location = f":{diagnostic.line}" if diagnostic.line is not None else ""
            print(f"{source}{location}: error: {diagnostic.message}", file=sys.stderr)
        return 1

    try:
        print(compile_module_prompt(ast, module, registry_dir=registry), end="")
    except KeyError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
