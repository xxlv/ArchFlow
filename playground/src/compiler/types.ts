export type DiagnosticSeverity = "error" | "warning";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  message: string;
  line?: number;
};

export type FlowNode = {
  kind: "action" | "state" | "condition" | "inference" | "raw";
  value: string;
};

export type ExceptionFlow = {
  name: string;
  sequence: FlowNode[];
  line?: number;
};

export type Workflow = {
  name: string;
  sequence: FlowNode[];
  exceptions: ExceptionFlow[];
  line?: number;
};

export type Component = {
  name: string;
  explicit: boolean;
  attributes: Record<string, string>;
  workflows: Workflow[];
  line?: number;
};

export type Channel = {
  source: string;
  via: string;
  target: string;
  schema?: string;
  line?: number;
};

export type ArchFlowAst = {
  version: "0.1";
  attributes: Record<string, string>;
  components: Record<string, Component>;
  channels: Channel[];
  diagnostics: Diagnostic[];
};

export type SourceRef =
  | { kind: "component"; id: string; line?: number }
  | { kind: "channel"; id: string; line?: number }
  | { kind: "diagnostic"; id: string; line?: number };

export type GraphNode = {
  id: string;
  label: string;
  stack?: string;
  line?: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  channel: string;
  schema?: string;
  line?: number;
};

export type GraphModel = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};
