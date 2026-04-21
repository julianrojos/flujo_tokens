import { useMemo, useRef, useState } from "react";

import type { PositionedGraph, PositionedNode } from "./graph-utils";
import { cn } from "@/lib/utils";
import { truncateLabel } from "./graph-utils";

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function initialViewport(): Viewport {
  return { x: 40, y: 200, scale: 0.9 };
}

export function TokenGraphViewer(props: {
  graph: PositionedGraph;
  selectedId: string | null;
  onSelect: (id: string) => void;
  graphFilePath?: string;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(() => initialViewport());
  const [panning, setPanning] = useState<{
    active: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ active: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  const bounds = useMemo(() => {
    const nodes = props.graph.nodes;
    if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const widths = { w: 260, h: 44 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + widths.w);
      maxY = Math.max(maxY, node.y + widths.h);
    }
    return { minX, minY, maxX, maxY };
  }, [props.graph.nodes]);

  const markerId = "arrow";

  const onWheel: React.WheelEventHandler<SVGSVGElement> = (event) => {
    event.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const delta = -event.deltaY;
    const zoomFactor = delta > 0 ? 1.08 : 0.92;

    setViewport((prev) => {
      const nextScale = clamp(prev.scale * zoomFactor, 0.22, 2.4);

      const graphX = (pointerX - prev.x) / prev.scale;
      const graphY = (pointerY - prev.y) / prev.scale;
      const nextX = pointerX - graphX * nextScale;
      const nextY = pointerY - graphY * nextScale;
      return { x: nextX, y: nextY, scale: nextScale };
    });
  };

  const onPointerDown: React.PointerEventHandler<SVGSVGElement> = (event) => {
    if (event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;
    svg.setPointerCapture(event.pointerId);
    setPanning({
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  };

  const onPointerMove: React.PointerEventHandler<SVGSVGElement> = (event) => {
    if (!panning.active) return;
    const dx = event.clientX - panning.startX;
    const dy = event.clientY - panning.startY;
    setViewport((prev) => ({ ...prev, x: panning.originX + dx, y: panning.originY + dy }));
  };

  const endPan: React.PointerEventHandler<SVGSVGElement> = (event) => {
    if (!panning.active) return;
    const svg = svgRef.current;
    if (svg) svg.releasePointerCapture(event.pointerId);
    setPanning((prev) => ({ ...prev, active: false }));
  };

  const reset = () => {
    setViewport(initialViewport());
  };

  const nodeSize = { w: 260, h: 44 };

  const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
  const contentHeight = Math.max(1, bounds.maxY - bounds.minY);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        className="h-[560px] w-full touch-none select-none rounded-lg border border-border bg-card/60"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onDoubleClick={reset}
        role="application"
        aria-label="Token dependency graph"
      >
        <defs>
          <marker
            id={markerId}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          {/* edges */}
          {props.graph.edges.map((edge) => {
            const from = props.graph.nodeById.get(edge.source);
            const to = props.graph.nodeById.get(edge.target);
            if (!from || !to) return null;

            const fromX = from.x + nodeSize.w;
            const fromY = from.y + nodeSize.h / 2;
            const toX = to.x;
            const toY = to.y + nodeSize.h / 2;
            const isCycleEdge = from.isCycleMember && to.isCycleMember;

            return (
              <line
                key={`${edge.source}→${edge.target}`}
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke="currentColor"
                className={cn(
                  isCycleEdge ? "text-primary opacity-70" : "text-primary opacity-35",
                )}
                strokeWidth={2}
                markerEnd={`url(#${markerId})`}
              />
            );
          })}

          {/* nodes */}
          {props.graph.nodes.map((node) => (
            <NodeBox
              key={node.id}
              node={node}
              width={nodeSize.w}
              height={nodeSize.h}
              selected={props.selectedId === node.id}
              onSelect={() => props.onSelect(node.id)}
            />
          ))}
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div>
          {props.graph.nodes.length} nodes · {props.graph.edges.length} edges ·{" "}
          {Math.round(viewport.scale * 100)}%
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span>Wheel to zoom · drag to pan · dblclick to reset</span>
        </div>
      </div>

      <div className="sr-only">
        Graph bounds {contentWidth}x{contentHeight}
      </div>
    </div>
  );
}

function NodeBox(props: {
  node: PositionedNode;
  width: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const fill = "fill-primary";
  const stroke = props.node.isCycleMember ? "stroke-status-error" : "stroke-primary";

  return (
    <g
      transform={`translate(${props.node.x} ${props.node.y})`}
      onClick={(e) => {
        e.stopPropagation();
        props.onSelect();
      }}
      role="button"
      tabIndex={0}
      aria-label={`Select ${props.node.displayKey}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          props.onSelect();
        }
      }}
    >
      <rect
        width={props.width}
        height={props.height}
        rx={10}
        className={cn("stroke-2", fill, stroke)}
        fillOpacity={0.1}
        strokeOpacity={props.selected ? 1 : 0.45}
      />
      <text x={12} y={18} className="fill-foreground text-[12px] font-semibold">
        {truncateLabel(props.node.displayKey, 36)}
      </text>
      <text x={12} y={34} className="fill-muted-foreground text-[11px]">
        {props.node.type} · in {props.node.inDegree} · out {props.node.outDegree}
      </text>
    </g>
  );
}
