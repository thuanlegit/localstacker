import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { aslToGraph } from "@/lib/sfn";

interface AslGraphProps {
  definition: string;
  onSelectState?: (name: string) => void;
}

type AslNodeData = {
  label: string;
  nodeType: string;
  synthetic: boolean;
};

const NODE_SPACING_X = 220;
const NODE_SPACING_Y = 120;

function StateNode({ data }: NodeProps<Node<AslNodeData>>) {
  return (
    <div
      className={`rounded-lg border px-4 py-2 text-center text-xs font-medium shadow-sm ${
        data.nodeType === "start" || data.nodeType === "end"
          ? "border-dashed bg-muted/40 text-muted-foreground"
          : "bg-card"
      }`}
    >
      {data.label}
      <span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
        {data.nodeType}
      </span>
    </div>
  );
}

const nodeTypes = { aslState: StateNode };

export function AslGraph({ definition, onSelectState }: AslGraphProps) {
  const { rfNodes, rfEdges } = useMemo(() => {
    const graph = aslToGraph(definition);

    // BFS depth from __start assigns rows; siblings spread horizontally.
    const depth: Record<string, number> = { __start: 0 };
    const queue = ["__start"];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const edge of graph.edges) {
        if (edge.from === current && depth[edge.to] === undefined) {
          depth[edge.to] = depth[current] + 1;
          queue.push(edge.to);
        }
      }
    }

    let maxDepth = 0;
    for (const d of Object.values(depth)) {
      if (d > maxDepth) maxDepth = d;
    }

    // Unreached nodes (should not happen in valid ASL) drop onto the last row.
    const rowIndex: Record<string, number> = {};
    for (const node of graph.nodes) {
      if (depth[node.id] === undefined) {
        depth[node.id] = maxDepth + 1;
      }
      rowIndex[node.id] = rowIndex[node.id] ?? 0;
    }

    const perDepthCount: Record<number, number> = {};
    const rfNodes: Node<AslNodeData>[] = graph.nodes.map((node) => {
      const row = depth[node.id];
      const col = perDepthCount[row] ?? 0;
      perDepthCount[row] = col + 1;
      return {
        id: node.id,
        type: "aslState",
        position: { x: col * NODE_SPACING_X, y: row * NODE_SPACING_Y },
        data: {
          label: node.label,
          nodeType: node.type,
          synthetic: node.id === "__start" || node.id === "__end",
        },
        draggable: false,
        selectable: true,
        connectable: false,
      };
    });

    const seen = new Set<string>();
    const rfEdges: Edge[] = [];
    for (const edge of graph.edges) {
      const id = `${edge.from}->${edge.to}${edge.label ? `:${edge.label}` : ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rfEdges.push({
        id,
        source: edge.from,
        target: edge.to,
        label: edge.label,
        type: "smoothstep",
      });
    }

    return { rfNodes, rfEdges };
  }, [definition]);

  return (
    <div className="h-full min-h-[240px] w-full" data-testid="asl-graph">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        fitView
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          if (!node.data.synthetic) {
            onSelectState?.(node.id);
          }
        }}
      >
        <Background />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
