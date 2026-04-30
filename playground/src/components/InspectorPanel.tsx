import type { ArchFlowAst, GraphModel } from "../compiler/types";

type InspectorPanelProps = {
  ast: ArchFlowAst;
  graph: GraphModel;
  selectedId?: string;
};

export function InspectorPanel({ ast, graph, selectedId }: InspectorPanelProps) {
  const node = graph.nodes.find((candidate) => candidate.id === selectedId);
  if (node) {
    const component = ast.components[node.id];
    return (
      <div className="inspector-card">
        <div className="eyebrow">Component</div>
        <h3>@{component.name}</h3>
        <dl>
          <dt>Stack</dt>
          <dd>{component.attributes.Stack ?? "Unspecified"}</dd>
          <dt>Workflows</dt>
          <dd>{component.workflows.length || "None"}</dd>
          <dt>Source</dt>
          <dd>{component.line ? `Line ${component.line}` : "Implicit endpoint"}</dd>
        </dl>
      </div>
    );
  }

  const edge = graph.edges.find((candidate) => candidate.id === selectedId);
  if (edge) {
    return (
      <div className="inspector-card">
        <div className="eyebrow">Channel Contract</div>
        <h3>[{edge.channel}]</h3>
        <dl>
          <dt>Source</dt>
          <dd>@{edge.source}</dd>
          <dt>Target</dt>
          <dd>@{edge.target}</dd>
          <dt>Schema</dt>
          <dd>{edge.schema ?? `Missing .Schema.${edge.channel}`}</dd>
          <dt>Source</dt>
          <dd>{edge.line ? `Line ${edge.line}` : "Unknown"}</dd>
        </dl>
      </div>
    );
  }

  return (
    <div className="inspector-card">
      <div className="eyebrow">System</div>
      <h3>{ast.attributes.System ?? "Unnamed ArchFlow System"}</h3>
      <p>Select a component, channel, or source line to inspect its contract boundary.</p>
    </div>
  );
}
