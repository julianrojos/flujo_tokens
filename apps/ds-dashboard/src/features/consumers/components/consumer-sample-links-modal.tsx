import { useMemo } from "react";
import { Modal, ModalCloseButton, ModalContent, ModalHeader } from "@/components/ui/overlay";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useSortState } from "@/lib/use-sort-state";
import type { SampleNodeRef } from "@/types/consumers";

interface ConsumerSampleLinksModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  consumerFileKey: string;
  sampleNodes: SampleNodeRef[];
}

type SortField = "pageName" | "nodeId";

function buildFigmaNodeUrl(consumerFileKey: string, nodeId: string): string {
  return `https://www.figma.com/design/${consumerFileKey}?node-id=${nodeId}`;
}

export function ConsumerSampleLinksModal({
  open,
  onClose,
  title,
  consumerFileKey,
  sampleNodes,
}: ConsumerSampleLinksModalProps) {
  const titleId = "consumer-sample-links-modal-title";
  const [sort, toggleSort] = useSortState<SortField>({ field: "pageName", dir: "asc" });

  const sortedNodes = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...sampleNodes].sort((a, b) => {
      if (sort.field === "pageName") {
        const page = mul * a.pageName.localeCompare(b.pageName);
        if (page !== 0) return page;
        return a.nodeId.localeCompare(b.nodeId);
      }
      return mul * a.nodeId.localeCompare(b.nodeId);
    });
  }, [sampleNodes, sort]);

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId}>
      <ModalContent size="lg" className="max-h-[90vh] overflow-hidden">
        <ModalHeader className="items-start gap-4">
          <div>
            <h3 id={titleId} className="text-base font-titles font-semibold titles-color">
              {title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Showing {sampleNodes.length} captured links with page context.
            </p>
          </div>
          <ModalCloseButton onClick={onClose} />
        </ModalHeader>

        <div className="max-h-[70vh] overflow-auto p-4">
          {sampleNodes.length === 0 ? (
            <div className="rounded-md border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
              No sample links captured for this usage.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead label="Page" onSort={() => toggleSort("pageName")} />
                  <SortableTableHead label="Node" onSort={() => toggleSort("nodeId")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNodes.map((sampleNode) => {
                  const pageName = String(sampleNode.pageName || "").trim() || "Unknown page";
                  const href = buildFigmaNodeUrl(consumerFileKey, sampleNode.nodeId);

                  return (
                    <TableRow key={`${sampleNode.nodeId}-${pageName}`}>
                      <TableCell className="align-top">
                        <div className="space-y-0.5">
                          <div className="font-medium text-foreground">{pageName}</div>
                          <div className="text-xs text-muted-foreground">{sampleNode.nodeId}</div>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-foreground hover:text-primary"
                        >
                          Open node
                        </a>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}
