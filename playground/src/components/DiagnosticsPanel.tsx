import type { Diagnostic } from "../compiler/types";

type DiagnosticsPanelProps = {
  diagnostics: Diagnostic[];
  onSelectLine: (line?: number) => void;
};

export function DiagnosticsPanel({ diagnostics, onSelectLine }: DiagnosticsPanelProps) {
  if (diagnostics.length === 0) {
    return <div className="empty-state">No diagnostics. The architecture is valid for the MVP grammar.</div>;
  }

  return (
    <div className="diagnostics-list">
      {diagnostics.map((diagnostic, index) => (
        <button className={`diagnostic-item ${diagnostic.severity}`} key={`${diagnostic.message}-${index}`} onClick={() => onSelectLine(diagnostic.line)}>
          <span className="diagnostic-severity">{diagnostic.severity}</span>
          <span className="diagnostic-message">{diagnostic.message}</span>
          {diagnostic.line ? <span className="diagnostic-line">L{diagnostic.line}</span> : null}
        </button>
      ))}
    </div>
  );
}
