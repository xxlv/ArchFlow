import type { ArchFlowAst, Component, Diagnostic, FlowNode, Workflow } from "./types";

const ATTR_RE = /^\.(?<key>[^:]+):\s*(?<value>.*)$/;
const CHANNEL_RE = /^@(?<source>[A-Za-z_]\w*)\s*=>\s*\[(?<via>[^\]]+)\]\s*=>\s*@(?<target>[A-Za-z_]\w*)$/;
const COMPONENT_RE = /^@(?<name>[A-Za-z_]\w*):?$/;
const WORKFLOW_RE = /^\$(?<name>[A-Za-z_]\w*):$/;
const EXCEPTION_RE = /^!\s*(?<name>[A-Za-z_]\w*)\s*(?<tail>>>.*)?$/;

export function parseArchFlow(text: string): ArchFlowAst {
  const ast: ArchFlowAst = {
    version: "0.1",
    attributes: {},
    components: {},
    channels: [],
    diagnostics: [],
  };

  let currentComponent: string | undefined;
  let currentWorkflow: Workflow | undefined;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const lineNo = index + 1;
    const stripped = rawLine.trim();
    if (!stripped || stripped.startsWith("#")) {
      return;
    }

    const indent = rawLine.length - rawLine.trimStart().length;
    if (rawLine.slice(0, indent).includes("\t")) {
      ast.diagnostics.push(diagnostic("error", "Tabs are not supported for indentation", lineNo));
      return;
    }
    if (indent % 2 !== 0) {
      ast.diagnostics.push(diagnostic("error", "Indentation must use multiples of two spaces", lineNo));
      return;
    }

    if (indent === 0) {
      currentComponent = undefined;
      currentWorkflow = undefined;
      currentComponent = parseRootLine(ast, stripped, lineNo);
      return;
    }

    if (indent === 2) {
      currentWorkflow = undefined;
      if (!currentComponent) {
        ast.diagnostics.push(diagnostic("error", "Module-level line appears outside a component block", lineNo));
        return;
      }
      parseComponentLine(ast, currentComponent, stripped, lineNo);
      const component = ast.components[currentComponent];
      currentWorkflow = component.workflows.at(-1);
      return;
    }

    if (indent === 4) {
      if (!currentComponent || !currentWorkflow) {
        ast.diagnostics.push(diagnostic("error", "Workflow line appears outside a workflow block", lineNo));
        return;
      }
      parseWorkflowLine(ast, currentWorkflow, stripped, lineNo);
      return;
    }

    ast.diagnostics.push(diagnostic("error", "Only root, module, and workflow indentation levels are supported", lineNo));
  });

  bindChannelSchemas(ast);
  return ast;
}

function parseRootLine(ast: ArchFlowAst, line: string, lineNo: number): string | undefined {
  const attr = ATTR_RE.exec(line);
  if (attr?.groups) {
    ast.attributes[attr.groups.key.trim()] = attr.groups.value.trim();
    return undefined;
  }

  const channel = CHANNEL_RE.exec(line);
  if (channel?.groups) {
    const source = channel.groups.source;
    const target = channel.groups.target;
    ensureComponent(ast, source, false, lineNo);
    ensureComponent(ast, target, false, lineNo);
    ast.channels.push({
      source,
      target,
      via: channel.groups.via.trim(),
      line: lineNo,
    });
    return undefined;
  }

  const component = COMPONENT_RE.exec(line);
  if (component?.groups) {
    const name = component.groups.name;
    ensureComponent(ast, name, true, lineNo);
    return name;
  }

  ast.diagnostics.push(diagnostic("error", `Unsupported root syntax: ${line}`, lineNo));
  return undefined;
}

function parseComponentLine(ast: ArchFlowAst, componentName: string, line: string, lineNo: number): void {
  const component = ast.components[componentName];
  const attr = ATTR_RE.exec(line);
  if (attr?.groups) {
    component.attributes[attr.groups.key.trim()] = attr.groups.value.trim();
    return;
  }

  const workflow = WORKFLOW_RE.exec(line);
  if (workflow?.groups) {
    component.workflows.push({
      name: workflow.groups.name,
      sequence: [],
      exceptions: [],
      line: lineNo,
    });
    return;
  }

  ast.diagnostics.push(diagnostic("error", `Unsupported component syntax: ${line}`, lineNo));
}

function parseWorkflowLine(ast: ArchFlowAst, workflow: Workflow, line: string, lineNo: number): void {
  const exception = EXCEPTION_RE.exec(line);
  if (exception?.groups) {
    const tail = exception.groups.tail ?? "";
    workflow.exceptions.push({
      name: exception.groups.name,
      sequence: parseSequence(tail.replace(/^>>/, "").trim()),
      line: lineNo,
    });
    return;
  }

  const sequence = parseSequence(line);
  if (sequence.length > 0) {
    workflow.sequence.push(...sequence);
    return;
  }

  ast.diagnostics.push(diagnostic("error", `Unsupported workflow syntax: ${line}`, lineNo));
}

function parseSequence(value: string): FlowNode[] {
  return value
    .split(">>")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseFlowNode);
}

function parseFlowNode(value: string): FlowNode {
  if (value.startsWith("[") && value.endsWith("]")) {
    return { kind: "action", value: value.slice(1, -1).trim() };
  }
  if (value.startsWith("(") && value.endsWith(")")) {
    return { kind: "state", value: value.slice(1, -1).trim() };
  }
  if (value.startsWith("?")) {
    return { kind: "condition", value: value.slice(1).trim() };
  }
  if (value.startsWith("~")) {
    return { kind: "inference", value: value.slice(1).trim() };
  }
  return { kind: "raw", value };
}

function bindChannelSchemas(ast: ArchFlowAst): void {
  ast.channels.forEach((channel) => {
    channel.schema = ast.attributes[`Schema.${channel.via}`];
  });
}

function ensureComponent(ast: ArchFlowAst, name: string, explicit: boolean, line?: number): Component {
  const existing = ast.components[name];
  if (existing) {
    if (explicit) {
      existing.explicit = true;
      existing.line = line;
    }
    return existing;
  }

  const component: Component = {
    name,
    explicit,
    attributes: {},
    workflows: [],
    line,
  };
  ast.components[name] = component;
  return component;
}

function diagnostic(severity: Diagnostic["severity"], message: string, line?: number): Diagnostic {
  return { severity, message, line };
}
