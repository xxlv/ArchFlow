from __future__ import annotations

import tempfile
import unittest
import json
from pathlib import Path

from archflow.cli import main
from archflow.generator import build_outputs, scaffold_outputs
from archflow.parser import parse_text
from archflow.prompts import compile_module_prompt
from archflow.validator import validate_ast


EXAMPLE = """\
.System: API_Publish_Platform
.Standard: REST_JSON
.Schema.HTTP: Request contract.
.Contract.HTTP.Envelope: JSON object with traceId:string and payload:HttpPayload.
.Contract.HTTP.Operations: submit -> { channel:"HTTP", title:string }.

@Client => [HTTP] => @Api

@Client:
  .Stack: React/TypeScript
  .Runtime.Port.dev: 5173
  .Use.HTTP.dev: proxy:/api
  $Submit:
    [Collect] >> [Send]

@Api:
  .Stack: Node.js/TypeScript
  .Runtime.Port.dev: 8080
  .Expose.HTTP: REST_JSON POST /api
  $Handle:
    [Validate] >> [Save]
    ! Invalid >> [Reject] >> (Failed)
"""


class ArchFlowTests(unittest.TestCase):
    def test_parse_and_validate_example(self) -> None:
        ast = parse_text(EXAMPLE)
        ast.diagnostics.extend(validate_ast(ast))

        self.assertEqual([], [d for d in ast.diagnostics if d.severity == "error"])
        self.assertEqual("API_Publish_Platform", ast.attributes["System"])
        self.assertEqual(["Client", "Api"], [ast.channels[0].source, ast.channels[0].target])
        self.assertEqual("Request contract.", ast.channels[0].schema)

    def test_prompt_is_module_scoped(self) -> None:
        ast = parse_text(EXAMPLE)
        prompt = compile_module_prompt(ast, "Api", registry_dir=Path("missing-registry"))

        self.assertIn("# ArchFlow Module Prompt: @Api", prompt)
        self.assertIn("[HTTP] from @Client", prompt)
        self.assertIn("Envelope: JSON object with traceId:string and payload:HttpPayload.", prompt)
        self.assertNotIn("$Submit", prompt)

    def test_build_outputs(self) -> None:
        ast = parse_text(EXAMPLE)
        ast.diagnostics.extend(validate_ast(ast))

        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            build_outputs(ast, out, registry_dir=Path("missing-registry"))
            self.assertTrue((out / "ast.json").exists())
            self.assertTrue((out / "runtime.json").exists())
            self.assertTrue((out / "prompts" / "Api.md").exists())
            self.assertTrue((out / "contracts" / "Client__HTTP__Api.schema.json").exists())
            self.assertTrue((out / "stubs" / "typescript" / "assembly.ts").exists())
            runtime = json.loads((out / "runtime.json").read_text(encoding="utf-8"))
            contracts = json.loads((out / "contracts.json").read_text(encoding="utf-8"))
            self.assertEqual(8080, runtime["profiles"]["dev"]["modules"]["Api"]["port"])
            self.assertEqual("http://localhost:8080", runtime["profiles"]["dev"]["channels"]["HTTP"]["binding"]["target"])
            self.assertEqual("submit -> { channel:\"HTTP\", title:string }.", contracts["Client__HTTP__Api"]["details"]["Operations"])

    def test_scaffold_outputs(self) -> None:
        ast = parse_text(EXAMPLE)
        ast.diagnostics.extend(validate_ast(ast))

        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp)
            scaffold_outputs(ast, out, registry_dir=Path("missing-registry"))
            self.assertTrue((out / "apps" / "client" / "ARCHFLOW_PROMPT.md").exists())
            self.assertTrue((out / "services" / "api" / "ARCHFLOW_PROMPT.md").exists())
            self.assertTrue((out / "shared" / "prompts" / "Client.md").exists())
            self.assertTrue((out / "shared" / "runtime.json").exists())
            self.assertIn(
                "# ArchFlow Module Prompt: @Client",
                (out / "apps" / "client" / "ARCHFLOW_PROMPT.md").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "- Runtime binding (dev): `proxy:/api`",
                (out / "apps" / "client" / "docs" / "contracts.md").read_text(encoding="utf-8"),
            )
            self.assertIn(
                "- Operations: submit -> { channel:\"HTTP\", title:string }.",
                (out / "apps" / "client" / "docs" / "contracts.md").read_text(encoding="utf-8"),
            )
            self.assertTrue((out / "shared" / "contracts" / "Client__HTTP__Api.schema.json").exists())
            self.assertTrue((out / "shared" / "mocks" / "Client__HTTP__Api.mock.json").exists())

    def test_plan_change_generates_patch_prompts_from_scaffold_baseline(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "example.af"
            workspace = root / "workspace"
            source.write_text(EXAMPLE, encoding="utf-8")

            self.assertEqual(0, main(["scaffold", str(source), "--out", str(workspace), "--registry", "missing-registry"]))
            self.assertTrue((workspace / ".archflow" / "snapshots" / "current" / "source.af").exists())
            current_metadata = json.loads((workspace / ".archflow" / "snapshots" / "current" / "metadata.json").read_text(encoding="utf-8"))
            self.assertEqual("scaffold", current_metadata["event"])
            self.assertTrue((workspace / ".archflow" / "snapshots" / current_metadata["id"] / "source.af").exists())

            changed_source = root / "example.changed.af"
            changed_source.write_text(
                EXAMPLE.replace(
                    '.Contract.HTTP.Operations: submit -> { channel:"HTTP", title:string }.',
                    '.Contract.HTTP.Operations: submit -> { channel:"HTTP", title:string, priority:"low"|"high" }.',
                ),
                encoding="utf-8",
            )

            self.assertEqual(0, main(["plan-change", str(changed_source), "--workspace", str(workspace), "--registry", "missing-registry"]))
            latest_status = json.loads((workspace / ".archflow" / "changes" / "latest" / "status.json").read_text(encoding="utf-8"))
            self.assertEqual("planned", latest_status["status"])
            self.assertEqual(current_metadata["id"], latest_status["fromSnapshot"])
            self.assertTrue((workspace / ".archflow" / "changes" / latest_status["id"] / "status.json").exists())
            patch_prompt = workspace / ".archflow" / "changes" / "latest" / "modules" / "client" / "PATCH_PROMPT.md"
            self.assertTrue(patch_prompt.exists())
            self.assertIn("Changed contract [HTTP].", patch_prompt.read_text(encoding="utf-8"))
            self.assertTrue((workspace / ".archflow" / "changes" / "latest" / "affected-modules.json").exists())

            self.assertEqual(0, main(["accept-change", str(changed_source), "--workspace", str(workspace), "--registry", "missing-registry"]))
            accepted_status = json.loads((workspace / ".archflow" / "changes" / "latest" / "status.json").read_text(encoding="utf-8"))
            self.assertEqual("accepted", accepted_status["status"])
            self.assertIsNotNone(accepted_status["toSnapshot"])
            self.assertTrue((workspace / ".archflow" / "snapshots" / accepted_status["toSnapshot"] / "source.af").exists())
            self.assertIn(
                'priority:"low"|"high"',
                (workspace / ".archflow" / "snapshots" / "current" / "source.af").read_text(encoding="utf-8"),
            )
            history = (workspace / ".archflow" / "history.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(["scaffold", "plan-change", "accept-change"], [json.loads(line)["event"] for line in history])


if __name__ == "__main__":
    unittest.main()
