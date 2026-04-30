import { useEffect, useMemo, useState } from "react";
import { AfEditor } from "./components/AfEditor";
import { DiagramView } from "./components/DiagramView";
import { DiagnosticsPanel } from "./components/DiagnosticsPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { compileArchFlow } from "./compiler/compile";
import { refIdForLine } from "./compiler/graph";
import kanbanExample from "./examples/kanban.af?raw";

const STORAGE_KEY = "archflow.playground.source";

export function App() {
  const [source, setSource] = useState(
    () => localStorage.getItem(STORAGE_KEY) ?? kanbanExample,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedLine, setSelectedLine] = useState<number>();
  const result = useMemo(() => compileArchFlow(source), [source]);
  const diagnostics = result.ast.diagnostics;
  const errorCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;
  const warningCount = diagnostics.filter(
    (diagnostic) => diagnostic.severity === "warning",
  ).length;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, source);
  }, [source]);

  function selectFromDiagram(id: string, line?: number): void {
    setSelectedId(id);
    setSelectedLine(line);
  }

  function selectFromLine(line?: number): void {
    if (!line) {
      return;
    }
    setSelectedLine(line);
    setSelectedId(refIdForLine(result.graph, line));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="eyebrow">ArchFlow Playground</div>
          <h1>Contract-first architecture, live in the browser.</h1>
        </div>
        <div className="status-pills" aria-label="Compilation status">
          <span className={`pill ${errorCount > 0 ? "error" : "ok"}`}>
            {errorCount} errors
          </span>
          <span className={`pill ${warningCount > 0 ? "warning" : "ok"}`}>
            {warningCount} warnings
          </span>
          <button
            className="reset-button"
            onClick={() => setSource(kanbanExample)}
          >
            Reset example
          </button>
        </div>
      </header>

      <section className="workspace">
        <div className="editor-pane">
          <div className="pane-title">Source .af</div>
          <AfEditor
            diagnostics={diagnostics}
            onChange={setSource}
            onLineFocus={selectFromLine}
            selectedLine={selectedLine}
            source={source}
          />
        </div>

        <div className="preview-pane">
          <div className="pane-title">Architecture Diagram</div>
          <DiagramView
            graph={result.graph}
            onSelect={selectFromDiagram}
            selectedId={selectedId}
          />
          <div className="details-grid">
            <section>
              <div className="pane-title compact">Diagnostics</div>
              <DiagnosticsPanel
                diagnostics={diagnostics}
                onSelectLine={selectFromLine}
              />
            </section>
            <section>
              <div className="pane-title compact">Inspector</div>
              <InspectorPanel
                ast={result.ast}
                graph={result.graph}
                selectedId={selectedId}
              />
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
