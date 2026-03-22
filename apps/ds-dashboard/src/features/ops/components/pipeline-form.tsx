import { useState, useCallback } from "react";
import {
  PlayCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useOperationRunner, formatRelativeTime } from "../hooks/use-operation-runner";
import { LogTerminal } from "./log-terminal";

// Pipeline steps in order — used for labels and tooltips
const PIPELINE_STEPS = [
  { value: "",         label: "Pipeline completo", hint: "Spec → Markdown" },
  { value: "markdown", label: "Desde Markdown",    hint: "Solo Markdown (omite Spec)" },
] as const;

interface PipelineFormProps {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  onRunSuccess?: () => void;
}

export function PipelineForm({
  id,
  label,
  description,
  endpoint,
  onRunSuccess,
}: PipelineFormProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Form state
  const [targetComponent, setTargetComponent] = useState<"all" | "single">("all");
  const [targetSlug, setTargetSlug] = useState("");
  const [fromStep, setFromStep] = useState<"" | "markdown">("");
  const [isDryRun, setIsDryRun] = useState(false);

  const [{ status, isRunning, logLines, summary, lastRunAt, elapsedMs }, { run, clearLogs }] =
    useOperationRunner(id, endpoint, onRunSuccess);

  const handleRun = useCallback(async () => {
    const params: Record<string, unknown> = { dryRun: isDryRun };
    if (targetComponent === "single" && targetSlug.trim()) {
      params.component = targetSlug.trim();
    } else {
      params.all = true;
    }
    if (fromStep) params.fromStep = fromStep;
    await run(params);
  }, [run, isDryRun, targetComponent, targetSlug, fromStep]);

  const handleClear = useCallback(() => {
    clearLogs();
  }, [clearLogs]);

  const canRun = !isRunning && !(targetComponent === "single" && !targetSlug.trim());
  const hasLogs = logLines.length > 0 || !!summary;

  const selectedStep = PIPELINE_STEPS.find((s) => s.value === fromStep) ?? PIPELINE_STEPS[0];

  const elapsedLabel =
    elapsedMs !== undefined
      ? elapsedMs >= 1000
        ? `${(elapsedMs / 1000).toFixed(1)}s`
        : `${elapsedMs}ms`
      : undefined;

  return (
    <div className="flex flex-col rounded-lg border border-border/70 bg-card shadow-sm overflow-hidden">
      {/* ── Collapsible header ── */}
      <button
        type="button"
        className="flex items-center justify-between px-4 py-3 bg-muted/20 hover:bg-muted/30 transition-colors text-left w-full"
        onClick={() => setIsOpen((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <PlayCircle className="h-4 w-4 text-primary shrink-0" />
                {label}
              </h3>
              {status === "success" && <CheckCircle2 className="h-3.5 w-3.5 text-status-success shrink-0" />}
              {status === "error"   && <XCircle       className="h-3.5 w-3.5 text-destructive shrink-0" />}
              {isDryRun && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-status-warning-bg/15 text-status-warning font-medium">
                  DRY RUN
                </span>
              )}
              {fromStep && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                  {selectedStep.label}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{description}</p>
          </div>
        </div>

        {/* Last run info */}
        <div className="hidden sm:flex flex-col items-end text-right shrink-0 ml-4">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Última ejecución
          </span>
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              status === "success" && "text-status-success",
              status === "error"   && "text-destructive"
            )}
          >
            {status === "running"
              ? "Ejecutando…"
              : status === "success" && elapsedLabel
              ? `Ahora · ${elapsedLabel}`
              : formatRelativeTime(lastRunAt)}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/50 p-4 bg-background space-y-5">
          {/* ── Form fields ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left col: target */}
            <div className="space-y-3">
              <FormLabel>Componente objetivo</FormLabel>
              <Select
                className="w-full"
                value={targetComponent}
                onChange={(e) => setTargetComponent(e.target.value as "all" | "single")}
                disabled={isRunning}
              >
                <option value="all">Todos los componentes</option>
                <option value="single">Componente específico…</option>
              </Select>

              {targetComponent === "single" && (
                <div>
                  <FormLabel>Slug del componente</FormLabel>
                  <Input
                    type="text"
                    placeholder="ej. alert, button, card"
                    className="mt-1.5"
                    value={targetSlug}
                    onChange={(e) => setTargetSlug(e.target.value)}
                    disabled={isRunning}
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Right col: step + dry run */}
            <div className="space-y-3">
              <div>
                <FormLabel>Iniciar desde paso</FormLabel>
                <Select
                  className="w-full mt-1.5"
                  value={fromStep}
                  onChange={(e) => setFromStep(e.target.value as typeof fromStep)}
                  disabled={isRunning}
                >
                  {PIPELINE_STEPS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
                {/* Step hint */}
                <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
                  <Info className="h-3 w-3 shrink-0" />
                  {selectedStep.hint}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id={`dry-run-${id}`}
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                  disabled={isRunning}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <label
                  htmlFor={`dry-run-${id}`}
                  className={cn(
                    "text-sm font-medium leading-none select-none cursor-pointer",
                    isRunning && "opacity-50 cursor-not-allowed"
                  )}
                >
                  Dry Run
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    (simula sin escribir)
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* ── Run button row ── */}
          <div className="flex items-center justify-between pt-1 border-t border-border/50">
            {hasLogs && !isRunning ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Limpiar output
              </button>
            ) : (
              <div />
            )}
            <button
              onClick={handleRun}
              disabled={!canRun}
              className="flex items-center gap-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2 text-sm font-medium transition disabled:opacity-50"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Ejecutando…
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4" />
                  Ejecutar pipeline
                </>
              )}
            </button>
          </div>

          {/* ── Log output ── */}
          {(hasLogs || isRunning) && (
            <LogTerminal
              logLines={logLines}
              summary={summary}
              status={status}
              elapsedMs={elapsedMs}
              onClear={handleClear}
            />
          )}
        </div>
      )}
    </div>
  );
}

function FormLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
      {children}
    </span>
  );
}
