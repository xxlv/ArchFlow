import type { ArchFlowAst, GraphEdge, GraphModel, GraphNode } from "./types";

export function graphFromAst(ast: ArchFlowAst): GraphModel {
  const nodes: GraphNode[] = Object.values(ast.components)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((component) => ({
      id: component.name,
      label: `@${component.name}`,
      stack: component.attributes.Stack,
      line: component.line,
    }));

  const edges: GraphEdge[] = ast.channels.map((channel, index) => ({
    id: `${channel.source}__${channel.via}__${channel.target}__${index}`,
    source: channel.source,
    target: channel.target,
    channel: channel.via,
    schema: channel.schema,
    line: channel.line,
  }));

  return { nodes, edges };
}

export function refIdForLine(graph: GraphModel, line: number): string | undefined {
  const edge = graph.edges.find((candidate) => candidate.line === line);
  if (edge) {
    return edge.id;
  }

  const node = graph.nodes.find((candidate) => candidate.line === line);
  return node?.id;
}
