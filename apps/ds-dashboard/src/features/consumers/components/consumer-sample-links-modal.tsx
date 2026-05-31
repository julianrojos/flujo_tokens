import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { Modal, ModalCloseButton, ModalContent, ModalHeader } from "@/components/ui/overlay";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSortState } from "@/lib/use-sort-state";
import type { SampleNodeRef } from "@/types/consumers";

interface ConsumerSampleLinksModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  consumerFileKey: string;
  sampleNodes: SampleNodeRef[];
}

type SortField = "pageName";

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
  const sortAriaSort = sort.dir === "asc" ? "ascending" : "descending";

  const sortedNodes = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    return [...sampleNodes].sort((a, b) => {
      const page = mul * a.pageName.localeCompare(b.pageName);
      if (page !== 0) return page;
      return a.nodeId.localeCompare(b.nodeId);
    });
  }, [sampleNodes, sort]);

  return (
    <Modal open={open} onClose={onClose} aria-labelledby={titleId}>
      <ModalContent size="md" className="max-h-[90vh] overflow-hidden">
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
                  <SortableTableHead
                    label="Page"
                    onSort={() => toggleSort("pageName")}
                    ariaSort={sort.field === "pageName" ? sortAriaSort : "none"}
                  />
                  <TableHead showSortIcon={false}>Figma node</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedNodes.map((sampleNode) => {
                  const pageName = String(sampleNode.pageName || "").trim() || "Unknown page";
                  const href = buildFigmaNodeUrl(consumerFileKey, sampleNode.nodeId);

                  return (
                    <TableRow key={`${sampleNode.nodeId}-${pageName}`}>
                      <TableCell className="align-top">
                        <div className="font-medium text-foreground">{pageName}</div>
                      </TableCell>
                      <TableCell className="align-top">
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-foreground hover:text-primary"
                          aria-label={`Open Figma node on ${pageName}`}
                          title={`Open Figma node on ${pageName}`}
                        >
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
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
