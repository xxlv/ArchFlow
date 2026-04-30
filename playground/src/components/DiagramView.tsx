import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { GraphEdge, GraphModel, GraphNode } from "../compiler/types";

type DiagramViewProps = {
  graph: GraphModel;
  selectedId?: string;
  onSelect: (id: string, line?: number) => void;
};

type PositionedNode = GraphNode & {
  x: number;
  y: number;
};

type NodePositions = Record<string, { x: number; y: number }>;

type DragState = {
  id: string;
  offsetX: number;
  offsetY: number;
};

const NODE_WIDTH = 190;
const NODE_HEIGHT = 78;
const LAYOUT_STORAGE_KEY = "archflow.playground.diagram.positions";

export function DiagramView({ graph, selectedId, onSelect }: DiagramViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [savedPositions, setSavedPositions] = useState<NodePositions>(() =>
    readSavedPositions(),
  );
  const [dragging, setDragging] = useState<DragState>();
  const positioned = useMemo(
    () => applySavedPositions(layoutNodes(graph.nodes), savedPositions),
    [graph.nodes, savedPositions],
  );
  const byId = new Map(positioned.map((node) => [node.id, node]));
  const width = Math.max(
    720,
    positioned.length * 240 + 80,
    ...positioned.map((node) => node.x + NODE_WIDTH + 80),
  );
  const height = Math.max(
    440,
    ...positioned.map((node) => node.y + NODE_HEIGHT + 80),
  );

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(savedPositions));
  }, [savedPositions]);

  function startDrag(
    node: PositionedNode,
    event: ReactPointerEvent<SVGGElement>,
  ): void {
    const point = svgPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    onSelect(node.id, node.line);
    setDragging({
      id: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
    });
  }

  function moveDrag(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!dragging) {
      return;
    }
    const point = svgPoint(event);
    if (!point) {
      return;
    }
    const nextX = clamp(
      point.x - dragging.offsetX,
      24,
      width - NODE_WIDTH - 24,
    );
    const nextY = clamp(
      point.y - dragging.offsetY,
      24,
      height - NODE_HEIGHT - 24,
    );
    setSavedPositions((current) => ({
      ...current,
      [dragging.id]: { x: nextX, y: nextY },
    }));
  }

  function endDrag(): void {
    setDragging(undefined);
  }

  function resetLayout(): void {
    setSavedPositions({});
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  }

  return (
    <div className="diagram-shell">
      <button className="diagram-reset" onClick={resetLayout}>
        Reset Layout
      </button>
      <svg
        aria-label="ArchFlow architecture diagram"
        className={`diagram ${dragging ? "dragging" : ""}`}
        onPointerLeave={endDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
      >
        <defs>
          <marker
            id="arrow"
            markerHeight="10"
            markerWidth="10"
            orient="auto"
            refX="9"
            refY="3"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
          </marker>
        </defs>

        <g className="edges">
          {graph.edges.map((edge, index) => {
            const source = byId.get(edge.source);
            const target = byId.get(edge.target);
            if (!source || !target) {
              return null;
            }
            return (
              <Edge
                edge={edge}
                index={index}
                key={edge.id}
                onSelect={onSelect}
                selected={selectedId === edge.id}
                source={source}
                target={target}
              />
            );
          })}
        </g>

        <g className="nodes">
          {positioned.map((node) => (
            <Node
              key={node.id}
              node={node}
              onDragStart={startDrag}
              selected={selectedId === node.id}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

function Node({
  node,
  selected,
  onDragStart,
}: {
  node: PositionedNode;
  selected: boolean;
  onDragStart: (
    node: PositionedNode,
    event: ReactPointerEvent<SVGGElement>,
  ) => void;
}) {
  const icon = stackIconFor(node.stack);

  return (
    <g
      className={`diagram-node ${selected ? "selected" : ""}`}
      onPointerDown={(event) => onDragStart(node, event)}
      role="button"
      tabIndex={0}
    >
      <title>
        {node.stack ? `${node.label}\nStack: ${node.stack}` : node.label}
      </title>
      <rect
        height={NODE_HEIGHT}
        rx="16"
        width={NODE_WIDTH}
        x={node.x}
        y={node.y}
      />
      <g
        className={`stack-icon ${icon.className}`}
        transform={`translate(${node.x + 18} ${node.y + 20})`}
      >
        <circle cx="19" cy="19" r="19" />
        {icon.kind === "react" ? <ReactGlyph /> : null}
        {icon.kind === "python" ? <PythonGlyph /> : null}
        {icon.kind === "generic" || icon.kind === "go" ? (
          <text className="stack-icon-label" x="19" y="20">
            {icon.label}
          </text>
        ) : null}
      </g>
      <text className="node-label" x={node.x + 68} y={node.y + 32}>
        {node.label}
      </text>
      <text className="node-meta" x={node.x + 68} y={node.y + 56}>
        {node.stack ?? "Stack: unspecified"}
      </text>
    </g>
  );
}

function ReactGlyph() {
  return (
    <g className="react-glyph">
      <ellipse cx="19" cy="19" rx="15" ry="5" />
      <ellipse cx="19" cy="19" rx="15" ry="5" transform="rotate(60 19 19)" />
      <ellipse cx="19" cy="19" rx="15" ry="5" transform="rotate(120 19 19)" />
      <circle cx="19" cy="19" r="3.2" />
    </g>
  );
}

function PythonGlyph() {
  return (
    <g className="python-glyph">
      <path d="M12 11c0-4 3-6 7-6h5c3 0 5 2 5 5v5H18c-3 0-6 2-6 5v-9z" />
      <path d="M26 27c0 4-3 6-7 6h-5c-3 0-5-2-5-5v-5h11c3 0 6-2 6-5v9z" />
      <circle cx="16" cy="10" r="1.5" />
      <circle cx="22" cy="28" r="1.5" />
    </g>
  );
}

function Edge({
  edge,
  index,
  source,
  target,
  selected,
  onSelect,
}: {
  edge: GraphEdge;
  index: number;
  source: PositionedNode;
  target: PositionedNode;
  selected: boolean;
  onSelect: DiagramViewProps["onSelect"];
}) {
  const sourceCenterX = source.x + NODE_WIDTH / 2;
  const targetCenterX = target.x + NODE_WIDTH / 2;
  const flowsRight = targetCenterX >= sourceCenterX;
  const sourceX = flowsRight ? source.x + NODE_WIDTH : source.x;
  const sourceY = source.y + NODE_HEIGHT / 2;
  const targetX = flowsRight ? target.x : target.x + NODE_WIDTH;
  const targetY = target.y + NODE_HEIGHT / 2;
  const lift = index % 2 === 0 ? -38 : 38;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2 + lift;
  const path = `M ${sourceX} ${sourceY} C ${midX} ${sourceY + lift}, ${midX} ${targetY + lift}, ${targetX} ${targetY}`;
  const labelWidth = Math.max(104, edge.channel.length * 8 + 32);
  const verticalDirection = Math.sign(targetY - sourceY) || 1;
  const labelX = midX + (flowsRight ? 0 : -28);
  const labelY = midY - verticalDirection * 34;

  return (
    <g
      className={`diagram-edge ${selected ? "selected" : ""}`}
      onClick={() => onSelect(edge.id, edge.line)}
      role="button"
      tabIndex={0}
    >
      <title>
        {edge.schema
          ? `[${edge.channel}]\n${edge.schema}`
          : `[${edge.channel}]`}
      </title>
      <path className="edge-track" d={path} markerEnd="url(#arrow)" />
      <path className="edge-flow" d={path} pathLength="100" />
      <circle className="edge-pulse" r="3.5">
        <animateMotion
          dur={selected ? "1.4s" : "2.3s"}
          repeatCount="indefinite"
          path={path}
        />
      </circle>
      <rect
        className="edge-label-bg"
        height="26"
        rx="13"
        width={labelWidth}
        x={labelX - labelWidth / 2}
        y={labelY - 16}
      />
      <text className="edge-label" x={labelX} y={labelY + 2}>
        [{edge.channel}]
      </text>
    </g>
  );
}

function layoutNodes(nodes: GraphNode[]): PositionedNode[] {
  return nodes.map((node, index) => ({
    ...node,
    x: 48 + index * 240,
    y: index % 2 === 0 ? 120 : 250,
  }));
}

function applySavedPositions(
  nodes: PositionedNode[],
  savedPositions: NodePositions,
): PositionedNode[] {
  return nodes.map((node) => ({
    ...node,
    ...(savedPositions[node.id] ?? {}),
  }));
}

function readSavedPositions(): NodePositions {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as NodePositions) : {};
  } catch {
    return {};
  }
}

function svgPoint(
  event: ReactPointerEvent<SVGElement>,
): { x: number; y: number } | undefined {
  const svg =
    event.currentTarget instanceof SVGSVGElement
      ? event.currentTarget
      : event.currentTarget.ownerSVGElement;
  if (!svg) {
    return undefined;
  }
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
  return { x: transformed.x, y: transformed.y };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function stackIconFor(stack?: string): {
  kind: "generic" | "go" | "python" | "react";
  label: string;
  className: string;
} {
  const normalized = stack?.toLowerCase() ?? "";
  if (normalized.includes("react")) {
    return { kind: "react", label: "R", className: "react" };
  }
  if (normalized === "go" || normalized.includes("golang")) {
    return { kind: "go", label: "Go", className: "go" };
  }
  if (normalized.includes("python")) {
    return { kind: "python", label: "Py", className: "python" };
  }
  if (normalized.includes("typescript")) {
    return { kind: "generic", label: "TS", className: "typescript" };
  }
  if (normalized.includes("node")) {
    return { kind: "generic", label: "JS", className: "node" };
  }
  return { kind: "generic", label: "</>", className: "generic" };
}
