import type { ComponentSpec, SpecProperty } from "@/types/component-spec";
import type { TokenEntry } from "@/types/token-registry";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";

const TYPE_DISPLAY: Record<string, string> = {
  enum: "VARIANT",
  text: "TEXT",
  boolean: "BOOLEAN",
  instance_swap: "INSTANCE_SWAP",
};

function typeBadgeVariant(type: string): "neutral" | "success" | "warning" {
  if (type === "enum") return "success";
  if (type === "boolean") return "warning";
  return "neutral";
}

function PropertyRow({ prop }: { prop: SpecProperty }) {
  const displayType = TYPE_DISPLAY[prop.type.toLowerCase()] ?? prop.type.toUpperCase();
  return (
    <TableRow>
      <TableCell className="font-medium">{prop.name}</TableCell>
      <TableCell>
        <Badge variant={typeBadgeVariant(prop.type.toLowerCase())}>{displayType}</Badge>
      </TableCell>
      <TableCell>
        {prop.values ? (
          <div className="flex flex-wrap gap-1">
            {prop.values.map((v) => (
              <code key={v} className="rounded bg-muted px-1 py-0.5 text-xs">
                {v}
              </code>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {prop.default === null || prop.default === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          String(prop.default)
        )}
      </TableCell>
      <TableCell>
        <Badge variant={prop.required ? "success" : "neutral"}>
          {prop.required ? "Yes" : "No"}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{prop.description}</TableCell>
    </TableRow>
  );
}

interface ComponentSpecViewerProps {
  spec: ComponentSpec;
  resolveToken?: (tokenRef: string) => { token: TokenEntry | null; usageCount: number | null };
}

export function ComponentSpecViewer({ spec, resolveToken }: ComponentSpecViewerProps) {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Summary
        </h4>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-medium">Purpose</dt>
            <dd className="text-muted-foreground">{spec.summary.purpose}</dd>
          </div>
          <div>
            <dt className="font-medium">When to use</dt>
            <dd className="text-muted-foreground">{spec.summary.when_to_use}</dd>
          </div>
          <div>
            <dt className="font-medium">When not to use</dt>
            <dd className="text-muted-foreground">{spec.summary.when_not_to_use}</dd>
          </div>
        </dl>
      </section>

      {/* Anatomy */}
      {spec.anatomy?.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Anatomy
          </h4>
          <ol className="space-y-1 text-sm">
            {spec.anatomy.map((item, idx) => (
              <li key={item.id} className="flex gap-2">
                <span className="w-5 flex-none font-mono text-xs text-muted-foreground">
                  {idx + 1}.
                </span>
                <span>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.id}</code>
                  {" — "}
                  {item.description}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {/* Properties */}
      {spec.properties?.length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Properties
          </h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Values</TableHead>
                <TableHead>Default</TableHead>
                <TableHead>Required</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spec.properties.map((prop) => (
                <PropertyRow key={prop.name} prop={prop} />
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* Token mapping */}
      {spec.token_mapping && Object.keys(spec.token_mapping).length > 0 ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Token Mapping
          </h4>
          <div className="space-y-3">
            {Object.entries(spec.token_mapping).map(([slot, conditions]) => (
              <div key={slot}>
                <p className="mb-1 font-mono text-xs font-semibold">{slot}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Condition</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>Resolved</TableHead>
                      <TableHead>Refs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(conditions).map(([condition, tokenRef]) => {
                      const meta = resolveToken ? resolveToken(tokenRef) : null;
                      return (
                        <TableRow key={condition}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {condition}
                          </TableCell>
                          <TableCell className="space-y-0.5">
                            {tokenRef === "TBD" ? (
                              <Badge variant="warning">TBD</Badge>
                            ) : meta?.token ? (
                              <>
                                <Link
                                  to={`/tokens/${encodeURIComponent(meta.token.path)}`}
                                  className="font-mono text-xs text-primary hover:underline"
                                >
                                  {tokenRef}
                                </Link>
                                <div className="font-mono text-[11px] text-muted-foreground">
                                  {meta.token.cssVar}
                                </div>
                              </>
                            ) : (
                              <div className="flex flex-wrap items-center gap-2">
                                <code className="font-mono text-xs">{tokenRef}</code>
                                <Badge variant="warning">Unknown</Badge>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {meta?.token ? meta.token.resolvedValue : "—"}
                          </TableCell>
                          <TableCell>
                            {meta && meta.usageCount !== null ? (
                              <Badge variant="neutral">{meta.usageCount} refs</Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Accessibility */}
      {spec.accessibility ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Accessibility
          </h4>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="font-medium">Role</dt>
              <dd className="font-mono text-xs">{spec.accessibility.role}</dd>
            </div>
            {spec.accessibility.focus?.tokens ? (
              <div>
                <dt className="font-medium">Focus tokens</dt>
                <dd className="space-y-0.5 font-mono text-xs text-muted-foreground">
                  {spec.accessibility.focus.tokens.inner ? (
                    <div>inner: {spec.accessibility.focus.tokens.inner}</div>
                  ) : null}
                  {spec.accessibility.focus.tokens.outer ? (
                    <div>outer: {spec.accessibility.focus.tokens.outer}</div>
                  ) : null}
                </dd>
              </div>
            ) : null}
            {spec.accessibility.labeling?.rules?.length ? (
              <div>
                <dt className="font-medium">Labeling</dt>
                <dd>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                    {spec.accessibility.labeling.rules.map((rule, i) => (
                      <li key={i}>{rule}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}

      {/* Best practices */}
      {spec.best_practices ? (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Best Practices
          </h4>
          <div className="grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="mb-1 font-semibold text-emerald-700">Do</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                {(spec.best_practices.do ?? []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-semibold text-red-700">Don't</p>
              <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                {(spec.best_practices.dont ?? []).map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
