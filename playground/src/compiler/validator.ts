import type { ArchFlowAst, Diagnostic } from "./types";

export function validateArchFlow(ast: ArchFlowAst): Diagnostic[] {
  return [
    ...validateComponents(ast),
    ...validateChannels(ast),
    ...validateWorkflows(ast),
    ...validateCycles(ast),
    ...validateRuntime(ast),
  ];
}

function validateComponents(ast: ArchFlowAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  Object.values(ast.components).forEach((component) => {
    if (!component.explicit) {
      diagnostics.push({
        severity: "warning",
        message: `Component @${component.name} is only declared as a channel endpoint and has no module block`,
        line: component.line,
      });
      return;
    }
    if (!component.attributes.Stack) {
      diagnostics.push({
        severity: "warning",
        message: `Component @${component.name} has no .Stack attribute`,
        line: component.line,
      });
    }
  });
  return diagnostics;
}

function validateChannels(ast: ArchFlowAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  ast.channels.forEach((channel) => {
    const key = `${channel.source}\0${channel.via}\0${channel.target}`;
    if (seen.has(key)) {
      diagnostics.push({
        severity: "warning",
        message: `Duplicate channel @${channel.source} => [${channel.via}] => @${channel.target}`,
        line: channel.line,
      });
    }
    seen.add(key);

    if (!ast.components[channel.source]) {
      diagnostics.push({ severity: "error", message: `Channel source @${channel.source} is not defined`, line: channel.line });
    }
    if (!ast.components[channel.target]) {
      diagnostics.push({ severity: "error", message: `Channel target @${channel.target} is not defined`, line: channel.line });
    }
    if (!channel.schema) {
      diagnostics.push({
        severity: "warning",
        message: `Channel [${channel.via}] has no .Schema.${channel.via} contract`,
        line: channel.line,
      });
    }
  });
  return diagnostics;
}

function validateWorkflows(ast: ArchFlowAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  Object.values(ast.components).forEach((component) => {
    const workflowNames = new Set<string>();
    component.workflows.forEach((workflow) => {
      if (workflowNames.has(workflow.name)) {
        diagnostics.push({
          severity: "warning",
          message: `Duplicate workflow $${workflow.name} in @${component.name}`,
          line: workflow.line,
        });
      }
      workflowNames.add(workflow.name);
      if (workflow.sequence.length === 0) {
        diagnostics.push({
          severity: "warning",
          message: `Workflow $${workflow.name} in @${component.name} has no main sequence`,
          line: workflow.line,
        });
      }
    });
  });
  return diagnostics;
}

function validateCycles(ast: ArchFlowAst): Diagnostic[] {
  const graph = new Map<string, string[]>();
  const lineByEdge = new Map<string, number | undefined>();
  ast.channels.forEach((channel) => {
    graph.set(channel.source, [...(graph.get(channel.source) ?? []), channel.target]);
    lineByEdge.set(edgeKey(channel.source, channel.target), channel.line);
  });

  const diagnostics: Diagnostic[] = [];
  const visited = new Set<string>();
  const active = new Set<string>();

  function visit(node: string, path: string[]): void {
    if (active.has(node)) {
      const cycle = [...path.slice(path.indexOf(node)), node];
      diagnostics.push({
        severity: "warning",
        message: `Channel graph contains a cycle: ${cycle.join(" -> ")}`,
        line: lineByEdge.get(edgeKey(path.at(-1) ?? "", node)),
      });
      return;
    }
    if (visited.has(node)) {
      return;
    }
    active.add(node);
    (graph.get(node) ?? []).forEach((child) => visit(child, [...path, child]));
    active.delete(node);
    visited.add(node);
  }

  Object.keys(ast.components).forEach((componentName) => visit(componentName, [componentName]));
  return diagnostics;
}

function validateRuntime(ast: ArchFlowAst): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const inboundByComponent = new Map<string, Set<string>>();
  const outboundByComponent = new Map<string, Set<string>>();

  ast.channels.forEach((channel) => {
    inboundByComponent.set(channel.target, new Set([...(inboundByComponent.get(channel.target) ?? []), channel.via]));
    outboundByComponent.set(channel.source, new Set([...(outboundByComponent.get(channel.source) ?? []), channel.via]));
  });

  Object.values(ast.components).forEach((component) => {
    Object.keys(component.attributes).forEach((key) => {
      if (key.startsWith("Expose.")) {
        const channelName = key.slice("Expose.".length);
        if (!inboundByComponent.get(component.name)?.has(channelName)) {
          diagnostics.push({
            severity: "warning",
            message: `Component @${component.name} exposes [${channelName}] but has no inbound channel with that name`,
            line: component.line,
          });
        }
      }
      if (key.startsWith("Use.")) {
        const channelName = key.slice("Use.".length).split(".")[0];
        if (!outboundByComponent.get(component.name)?.has(channelName)) {
          diagnostics.push({
            severity: "warning",
            message: `Component @${component.name} uses [${channelName}] but has no outbound channel with that name`,
            line: component.line,
          });
        }
      }
    });
  });

  return diagnostics;
}

function edgeKey(source: string, target: string): string {
  return `${source}\0${target}`;
}
