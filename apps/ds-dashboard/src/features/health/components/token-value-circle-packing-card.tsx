import { useMemo } from "react";
import { hierarchy, pack, type HierarchyNode } from "d3";
import { useNavigate, useParams } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  buildSharedValueClusters,
  summarizeSharedValues,
  type SharedValueCluster,
} from "../lib/token-shared-value-clusters";
import { useTokenCatalogQuery } from "../use-health-queries";

const VIEWBOX_SIZE = 720;
const PACK_PADDING = 8;

type TokenCircleNode =
  | {
      kind: "root";
      label: string;
      children: TokenCircleNode[];
    }
  | {
      kind: "cluster";
      label: string;
      fill: string;
      cluster: SharedValueCluster;
      children: TokenCircleNode[];
    }
  | {
      kind: "token";
      label: string;
      path: string;
      collection: string;
      type: string;
      resolvedValue: string;
    };

function buildHierarchy(clusters: SharedValueCluster[]): TokenCircleNode {
  return {
    kind: "root",
    label: "root",
    children: clusters.map((cluster) => ({
      kind: "cluster",
      label: cluster.label,
      fill: cluster.fill,
      cluster,
      children: cluster.tokens.map((token) => ({
        kind: "token",
        label: token.path,
        path: token.path,
        collection: token.collection,
        type: token.type,
        resolvedValue: token.resolvedValue,
      })),
    })),
  };
}

function isClusterNode(node: HierarchyNode<TokenCircleNode>): node is HierarchyNode<TokenCircleNode> & {
  data: Extract<TokenCircleNode, { kind: "cluster" }>;
} {
  return node.depth === 1 && node.data.kind === "cluster";
}

function isLeafNode(node: HierarchyNode<TokenCircleNode>): node is HierarchyNode<TokenCircleNode> & {
  data: Extract<TokenCircleNode, { kind: "token" }>;
} {
  return node.depth === 2 && node.data.kind === "token";
}

export function TokenValueCirclePackingCard() {
  const { systemId } = useParams<{ systemId: string }>();
  const resolvedSystemId = String(systemId || "").trim();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useTokenCatalogQuery(resolvedSystemId);

  const clusters = useMemo(
    () => buildSharedValueClusters(data?.entries ?? []),
    [data],
  );
  const summary = useMemo(() => summarizeSharedValues(clusters), [clusters]);

  const packed = useMemo(() => {
    if (clusters.length === 0) return null;
    const rootData = buildHierarchy(clusters);
    const root = hierarchy<TokenCircleNode>(rootData)
      .sum((datum) => (datum.kind === "token" ? 1 : 0))
      .sort((a, b) => (Number(b.value ?? 0) - Number(a.value ?? 0)) || a.depth - b.depth);

    return pack<TokenCircleNode>()
      .size([VIEWBOX_SIZE, VIEWBOX_SIZE])
      .padding(PACK_PADDING)(root);
  }, [clusters]);

  // Single descendants() traversal split into cluster/leaf nodes
  const { parentNodes, leafNodes } = useMemo(() => {
    const all = packed?.descendants() ?? [];
    return {
      parentNodes: all.filter(isClusterNode),
      leafNodes: all.filter(isLeafNode),
    };
  }, [packed]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Valores compartidos</CardTitle>
          <CardDescription>Cargando clusters de valores…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[360px] animate-pulse rounded-xl bg-muted/60" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Valores compartidos</CardTitle>
          <CardDescription>Token chart unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <StatusAlert variant="warning" title="Gráfica no disponible">
            No se pudo cargar el catálogo de tokens para este sistema.
          </StatusAlert>
        </CardContent>
      </Card>
    );
  }

  if (clusters.length === 0 || !packed) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Valores compartidos</CardTitle>
              <CardDescription>Solo se muestran valores usados por 2 o más tokens.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <StatusAlert variant="success" title="Sin valores compartidos">
            No se encontraron valores resueltos duplicados.
          </StatusAlert>
        </CardContent>
      </Card>
    );
  }

  const excessLabel = summary.duplicateExcess === 1
    ? "1 token podría consolidarse"
    : `${summary.duplicateExcess} tokens podrían consolidarse`;

  return (
    <Card className="md:max-w-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Valores compartidos</CardTitle>
            <CardDescription>
              {excessLabel} · {summary.uniqueValues} {summary.uniqueValues === 1 ? "valor compartido" : "valores compartidos"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          <svg
            viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
            role="img"
            aria-label={`Valores compartidos: ${summary.uniqueValues} clusters, ${summary.sharedTokens} tokens`}
            className="block h-auto w-full max-w-[420px]"
          >
            <g>
              {parentNodes.map((node) => {
                const fill = node.data.fill;
                const clusterUrl = `/tokens?${new URLSearchParams({
                  group: "resolvedValue",
                  value: node.data.cluster.label,
                }).toString()}`;

                return (
                  <g
                    key={node.data.cluster.key}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: "pointer" }}
                    role="link"
                    tabIndex={0}
                    aria-label={`Ver tokens con el mismo valor ${node.data.cluster.label}`}
                    onClick={() => navigate(clusterUrl)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(clusterUrl);
                      }
                    }}
                  >
                    <circle
                      r={node.r}
                      fill={fill}
                      fillOpacity={0.18}
                      stroke={fill}
                      strokeOpacity={0.35}
                      strokeWidth={2}
                    >
                      <title>{`${node.data.label} · ${node.data.cluster.count} tokens`}</title>
                    </circle>
                  </g>
                );
              })}

              {leafNodes.map((node) => {
                const cluster = node.parent?.data.kind === "cluster" ? node.parent.data : null;
                const fill = cluster?.fill || "#94a3b8";
                const tokenPath = node.data.path;
                const tokenLabel = `${tokenPath} · ${node.data.resolvedValue}`;
                const leafRadius = node.r * 0.75;
                return (
                  <g
                    key={tokenPath}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ pointerEvents: "none" }}
                  >
                    <circle
                      r={leafRadius}
                      fill={fill}
                      fillOpacity={0.72}
                    >
                      <title>{tokenLabel}</title>
                    </circle>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
