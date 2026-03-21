import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal, ModalContent } from "@/components/ui/overlay/modal";
import { StatusAlert } from "@/components/ui/status-alert";
import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";
import { ApiErrorMessage } from "@/components/api-error-message";
import {
  buildImportSuccessSummary,
  type ImportSuccessSummary,
} from "@/features/system/new-system-import-summary";
import { findSystemNameCollision } from "@/features/system/new-system-page-logic";
import { ImportSuccessNotice } from "@/features/system/import-success-notice";
import {
  buildPhaseAwareError,
  extractCaptureFigmaErrorDetail,
  extractCapturePipelinePhase,
  extractPhaseAwareCaptureFigmaError,
  formatCaptureFigmaErrorMessage,
  toCapturePipelinePhase,
  toPipelinePhaseFromError,
} from "@/features/system/new-system-import-errors";
import {
  ApiError,
  cancelQueueJob,
  captureFigmaScreenshot,
  createDesignSystem,
  pingFigmaFile,
  refreshTokenGraph,
  type CaptureFigmaErrorDetail,
  type CaptureFigmaProgress,
  type FigmaPingResult,
  type TokensBootstrapResult,
  type TokensCompileResult,
} from "@/lib/api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "@/lib/api-error-ux";
import { useDesignSystem } from "@/lib/design-system-context";
import { cn } from "@/lib/utils";

function toSystemId(rawName: string) {
  return rawName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function extractFigmaFileIdFromUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";

  try {
    const parsed = new URL(value);
    const segments = parsed.pathname.split("/").filter(Boolean);
    for (let i = 0; i < segments.length - 1; i += 1) {
      if (segments[i] === "file" || segments[i] === "design") {
        return segments[i + 1] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function toDocumentWideFigmaUrl(rawUrl: string): string {
  const value = rawUrl.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value);
    parsed.searchParams.delete("node-id");
    parsed.searchParams.delete("node_id");
    parsed.searchParams.delete("nodeId");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value;
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasNoCaptureTargets(result: {
  ok?: boolean;
  targets_total?: number;
  targets?: unknown[];
  captured?: unknown[];
}): boolean {
  if (result.ok === false) return false;
  const targetsCount = result.targets_total ?? result.targets?.length ?? 0;
  const capturedCount = result.captured?.length ?? 0;
  return targetsCount === 0 && capturedCount === 0;
}

function isLowSignalCaptureMessage(rawValue: unknown): boolean {
  const value = toNonEmptyString(rawValue).toLowerCase();
  if (!value) return true;
  if (value === "unknown error." || value === "unknown queue error.") return true;
  if (/^failed with code \d+$/i.test(value)) return true;
  if (/^queued operation finished with status '?(error|cancelled)'?\.?$/i.test(value)) return true;
  if (value === "the import job finished without a detailed result payload.") return true;
  return false;
}

function pickCaptureFailureMessage(candidates: unknown[]): string {
  const messages = candidates
    .map((candidate) => toNonEmptyString(candidate))
    .filter(Boolean);
  if (messages.length === 0) return "";
  const highSignal = messages.find((message) => !isLowSignalCaptureMessage(message));
  return highSignal || messages[0] || "";
}

function formatPipelinePhaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

function formatPipelinePhaseMessage(phase: string): string {
  if (!phase) return "";
  return `Import failed during '${formatPipelinePhaseLabel(phase)}' phase.`;
}

function getPipelinePhaseHint(phase: string): string | null {
  if (phase === "token_sync") {
    return "The import failed while syncing Figma variables. Components and tokens were not generated.";
  }
  if (phase === "resolve_context" || phase === "parse_descriptor") {
    return "The import failed before component capture started. Check Figma URL, file key and access permissions.";
  }
  if (phase === "build_targets") {
    return "The import failed while resolving capturable components from the Figma file.";
  }
  if (phase === "capture_batch") {
    return "The import failed during screenshot/component capture execution.";
  }
  return null;
}


function extractCaptureFailureFromPayload(payload: unknown): string {
  const root = toRecord(payload);
  if (!root) return "";

  const job = toRecord(root.job);
  const result = toRecord(job?.result);
  const resultPayload = toRecord(result?.payload);
  const sync = toRecord(resultPayload?.sync);
  const registryRefresh = toRecord(resultPayload?.registry_refresh);
  const failed = Array.isArray(resultPayload?.failed) ? resultPayload.failed : [];
  const firstFailed = failed.length > 0 ? toRecord(failed[0]) : null;
  const events = Array.isArray(root.events) ? root.events : [];
  const figmaErrorDetail = extractCaptureFigmaErrorDetail(payload);
  const pipelinePhase = extractCapturePipelinePhase(payload);

  let lastErrorEventMessage = "";
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = toRecord(events[index]);
    if (!event) continue;
    const eventType = toNonEmptyString(event.type).toLowerCase();
    if (eventType === "error") {
      lastErrorEventMessage = toNonEmptyString(event.message);
      if (lastErrorEventMessage) break;
    }
    if (eventType === "end") {
      const eventStatus = toNonEmptyString(event.status).toLowerCase();
      if (eventStatus === "error" || eventStatus === "cancelled") {
        lastErrorEventMessage = toNonEmptyString(event.summary);
        if (lastErrorEventMessage) break;
      }
    }
  }

  return pickCaptureFailureMessage([
    formatCaptureFigmaErrorMessage(figmaErrorDetail),
    resultPayload?.error,
    resultPayload?.message,
    resultPayload?.stderr,
    firstFailed?.error,
    sync?.error,
    sync?.reason,
    sync?.stderr,
    registryRefresh?.stderr,
    lastErrorEventMessage,
    result?.summary,
    formatPipelinePhaseMessage(pipelinePhase),
  ]);
}

function getImportErrorHint(
  message: string,
  figmaError: CaptureFigmaErrorDetail | null,
  pipelinePhase: string,
): string | null {
  const phaseHint = getPipelinePhaseHint(pipelinePhase);
  if (phaseHint) return phaseHint;

  const status = figmaError?.status;
  if (status === 404) {
    return "Figma returned 404 for this file key. Verify the URL/file key and that the token can access that file.";
  }
  if (status === 403) {
    return "Figma returned 403. The token is valid but does not have permission to read this file.";
  }
  const normalized = message.toLowerCase();
  if (normalized.includes("figma api error 404")) {
    return "Figma returned 404. Check that the file key is correct and the token has access to that file.";
  }
  if (normalized.includes("figma api error 403")) {
    return "Figma returned 403. The token is valid but it does not have permission to read this file.";
  }
  if (normalized.includes("validation.invalid_figma_host")) {
    return "The URL host is not valid for Figma. Use a figma.com design/file URL.";
  }
  return null;
}

function normalizeReason(value: string): string {
  return value.trim().toLowerCase();
}

function mapTokensBootstrapReason(reason: string): string {
  const normalized = normalizeReason(reason);
  if (normalized === "variables-empty") {
    return "No Figma local variables were found in this file.";
  }
  if (normalized === "input-json-exists") {
    return "Input token JSON already exists, so bootstrap was skipped.";
  }
  if (normalized === "figma-file-key-missing") {
    return "Figma file key could not be resolved for token bootstrap.";
  }
  if (normalized === "system-input-dir-missing") {
    return "Input directory is not configured for this system.";
  }
  if (normalized === "system-missing") {
    return "System configuration could not be resolved for token bootstrap.";
  }
  if (normalized === "fetch-failed") {
    return "Fetching Figma variables failed.";
  }
  return reason ? `Unknown reason: ${reason}` : "No bootstrap reason was provided.";
}

function getTokensBootstrapErrorHint(errorMessage: string): string | null {
  const normalized = String(errorMessage || "").toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("file_variables:read")) {
    return "REST variables scope is not available. Keep tokens source on direct plugin connection and verify plugin connection before retrying.";
  }
  if (normalized.includes("mcp server reports no figma connection")) {
    return "Direct plugin connection could not connect to Figma. Open the Figma plugin and run 'Test connection' before retrying.";
  }
  return null;
}

function isCriticalTokensBootstrapFailure(result: TokensBootstrapResult | null): boolean {
  if (!result) return false;
  if (result.error) return true;
  const normalized = normalizeReason(result.reason || "");
  return (
    normalized === "fetch-failed" ||
    normalized === "system-missing" ||
    normalized === "system-input-dir-missing" ||
    normalized === "figma-file-key-missing"
  );
}

function mapTokensCompileReason(reason: string): string {
  const normalized = normalizeReason(reason);
  if (normalized === "disabled-by-config") {
    return "Token compilation is disabled for this system (compileVariablesOnCapture is off).";
  }
  if (normalized === "input-json-missing") {
    return "Token compilation was skipped because no input JSON files were available.";
  }
  if (normalized === "system-input-dir-missing") {
    return "Input directory is not configured for this system.";
  }
  if (normalized === "system-missing") {
    return "System configuration could not be resolved for token compilation.";
  }
  if (normalized === "compile-failed") {
    return "Token compilation command failed.";
  }
  if (normalized === "compiled") {
    return "Token compilation completed successfully.";
  }
  return reason ? `Unknown reason: ${reason}` : "No compilation reason was provided.";
}

function getCaptureErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const figmaErrorMessage = formatCaptureFigmaErrorMessage(
      extractCaptureFigmaErrorDetail(error.payload),
    );
    const payloadMessage = extractCaptureFailureFromPayload(error.payload);
    return figmaErrorMessage || payloadMessage || error.message || "Unknown API error";
  }

  if (!(error instanceof Error)) return String(error);
  const message = error.message || "Unknown error";
  const match = message.match(/:\s*(\{[\s\S]+\})\s*$/);
  if (!match) return message;
  try {
    const parsed = JSON.parse(match[1]) as {
      error?: string;
      message?: string;
      failed?: Array<{ error?: string }>;
      registry_refresh?: { stderr?: string };
    };
    return (
      parsed.error ||
      parsed.message ||
      parsed.failed?.[0]?.error ||
      parsed.registry_refresh?.stderr ||
      message
    );
  } catch {
    return message;
  }
}

function stringifySafe(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getCaptureErrorDetails(error: unknown): string {
  if (error instanceof ApiError) {
    const payloadCause = extractCaptureFailureFromPayload(error.payload);
    const figmaErrorDetail = extractCaptureFigmaErrorDetail(error.payload);
    const pipelinePhase = extractCapturePipelinePhase(error.payload);
    const lines = [
      `message: ${error.message || "Unknown API error"}`,
      `status: ${error.status} ${error.statusText}`,
      `code: ${error.code}`,
      `recoverable: ${error.recoverable ? "yes" : "no"}`,
    ];
    if (payloadCause) {
      lines.push(`derivedCause: ${payloadCause}`);
    }
    if (pipelinePhase) {
      lines.push(`pipelinePhase: ${pipelinePhase}`);
    }
    if (figmaErrorDetail) {
      lines.push(`figmaError:\n${stringifySafe(figmaErrorDetail)}`);
    }
    if (error.requestId) {
      lines.push(`requestId: ${error.requestId}`);
    }
    if (error.context) {
      lines.push(`context:\n${stringifySafe(error.context)}`);
    }
    if (error.payload) {
      lines.push(`payload:\n${stringifySafe(error.payload)}`);
    }
    return lines.join("\n\n");
  }

  if (error instanceof Error) {
    const lines = [error.message || "Unknown error"];
    const figmaError = extractPhaseAwareCaptureFigmaError(error);
    const pipelinePhase = toPipelinePhaseFromError(error);
    if (pipelinePhase) lines.push(`pipelinePhase: ${pipelinePhase}`);
    if (figmaError) lines.push(`figmaError:\n${stringifySafe(figmaError)}`);
    if (error.stack) lines.push(error.stack);
    return lines.join("\n\n");
  }

  if (typeof error === "string") return error;
  return stringifySafe(error);
}

function makeInlineErrorDisplay(args: {
  title: string;
  message: string;
  action?: string;
  retryable?: boolean;
}): ApiErrorDisplay {
  return {
    title: args.title,
    message: args.message,
    action: args.action ?? null,
    code: null,
    requestId: null,
    retryable: args.retryable ?? true,
  };
}

export function NewSystemPage() {
  const navigate = useNavigate();
  const { replaceSystems, setActiveSystem, systems } = useDesignSystem();

  const [systemName, setSystemName] = useState("");
  const [systemIdOverride, setSystemIdOverride] = useState("");
  const [appName, setAppName] = useState("");
  const [figmaFileUrl, setFigmaFileUrl] = useState("");
  const [figmaAccessToken, setFigmaAccessToken] = useState("");
  const [compileVariablesOnCapture, setCompileVariablesOnCapture] = useState(true);
  const [makeDefault, setMakeDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiErrorDisplay | null>(null);
  const [savedSystemId, setSavedSystemId] = useState("");
  const [captureProgress, setCaptureProgress] = useState<CaptureFigmaProgress | null>(null);
  const [showImportProgressModal, setShowImportProgressModal] = useState(false);
  const [importCompleted, setImportCompleted] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importErrorDetails, setImportErrorDetails] = useState("");
  const [showImportErrorDetails, setShowImportErrorDetails] = useState(false);
  const [importFigmaError, setImportFigmaError] = useState<CaptureFigmaErrorDetail | null>(null);
  const [importPipelinePhase, setImportPipelinePhase] = useState("");
  const [importSourceUrl, setImportSourceUrl] = useState("");
  const [importSourceFileKey, setImportSourceFileKey] = useState("");
  const [importJobId, setImportJobId] = useState("");
  const [importRequestId, setImportRequestId] = useState("");
  const [isCancellingImport, setIsCancellingImport] = useState(false);
  const [importControlNotice, setImportControlNotice] = useState("");
  const [importTokensBootstrap, setImportTokensBootstrap] = useState<TokensBootstrapResult | null>(null);
  const [importTokensCompile, setImportTokensCompile] = useState<TokensCompileResult | null>(null);
  const [importSuccessSummary, setImportSuccessSummary] = useState<ImportSuccessSummary | null>(null);
  const [pingResult, setPingResult] = useState<FigmaPingResult | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const pingRequestSeqRef = useRef(0);

  const generatedFromName = useMemo(() => toSystemId(systemName), [systemName]);
  const generatedSystemId = (systemIdOverride.trim() || generatedFromName).trim();
  const safeId = generatedSystemId || "my-new-system";
  const figmaFileId = extractFigmaFileIdFromUrl(figmaFileUrl);
  const safeInputDir = `input/${safeId}`;
  const safeOutputDir = `output/${safeId}`;
  const safeDocsDir = `docs/${safeId}`;

  const hasFigmaUrl = !!figmaFileUrl.trim();
  const hasToken = !!figmaAccessToken.trim();
  const collidingSystem = useMemo(
    () =>
      findSystemNameCollision({
        candidateName: systemName,
        systems,
      }),
    [systemName, systems],
  );
  const hasNameCollision = collidingSystem !== null;
  const figmaUrlValid = !hasFigmaUrl || (() => {
    try {
      const parsed = new URL(figmaFileUrl.trim());
      const host = parsed.hostname.toLowerCase();
      return host === "figma.com" || host.endsWith(".figma.com");
    } catch {
      return false;
    }
  })();
  const canSave = !!systemName.trim() && !!generatedSystemId && !saving
    && !hasNameCollision
    && (!hasFigmaUrl || hasToken) && figmaUrlValid;
  const pingValidationPending =
    hasFigmaUrl && hasToken && figmaUrlValid && !pingLoading && !pingResult;
  const hasExistingSystems = systems.length > 0;
  const progressTotal = captureProgress?.total ?? 0;
  const progressCompleted = captureProgress?.completed ?? 0;
  const progressRemaining = captureProgress?.remaining ?? Math.max(0, progressTotal - progressCompleted);
  const importErrorHint = importError
    ? getImportErrorHint(importError, importFigmaError, importPipelinePhase)
    : null;
  const importStatusText = useMemo(() => {
    if (isCancellingImport) return "Stopping import...";
    if (importError) return "Import failed.";
    if (importCompleted) return "Import completed successfully.";
    if (!captureProgress) return "Preparing import...";
    if (captureProgress.status === "queued") {
      return "Queued in backend. Waiting for worker assignment...";
    }
    if (captureProgress.status === "running") {
      if (progressTotal > 0) {
        return `${progressCompleted}/${progressTotal} downloaded · ${progressRemaining} remaining`;
      }
      return "Running import. Waiting for first progress event...";
    }
    if (captureProgress.status === "cancelled") return "Import was cancelled.";
    if (captureProgress.status === "error") return "Import failed.";
    return "Import completed successfully.";
  }, [
    captureProgress,
    isCancellingImport,
    importCompleted,
    importError,
    progressCompleted,
    progressRemaining,
    progressTotal,
  ]);
  const importCurrentSlug = captureProgress?.currentSlug?.trim() || "";
  const importProgressSummary = useMemo(() => {
    const componentsImported = Math.max(
      0,
      captureProgress?.completed ??
        importSuccessSummary?.elementsImported ??
        0,
    );
    const componentsDetected = Math.max(
      componentsImported,
      captureProgress?.total ??
        importSuccessSummary?.elementsTotal ??
        0,
    );

    const variablesImported = Math.max(
      0,
      importTokensBootstrap?.tokens_written ??
        importSuccessSummary?.variablesImported ??
        0,
    );
    const variablesDetected = Math.max(
      variablesImported,
      importTokensBootstrap?.tokens_total ??
        importSuccessSummary?.variablesTotal ??
        0,
    );

    return {
      componentsImported,
      componentsDetected,
      variablesImported,
      variablesDetected,
    };
  }, [captureProgress, importSuccessSummary, importTokensBootstrap]);
  const bootstrapReason = importTokensBootstrap?.reason ?? "";
  const bootstrapReasonMessage = mapTokensBootstrapReason(bootstrapReason);
  const bootstrapErrorHint = getTokensBootstrapErrorHint(importTokensBootstrap?.error ?? "");
  const bootstrapHasCriticalFailure = isCriticalTokensBootstrapFailure(importTokensBootstrap);
  const compileReason = importTokensCompile?.reason ?? "";
  const compileReasonMessage = mapTokensCompileReason(compileReason);
  const tokensAttempted = importTokensCompile?.attempted === true;
  const tokensCompiled = importTokensCompile?.compiled === true;
  const canShowTokensLink =
    importCompleted &&
    !importError &&
    !bootstrapHasCriticalFailure &&
    (!importTokensCompile || tokensCompiled);
  const isImportCancelable =
    !!importJobId &&
    !importCompleted &&
    !importError &&
    (captureProgress?.status === "queued" || captureProgress?.status === "running");

  useEffect(() => {
    if (!hasExistingSystems) {
      setMakeDefault(false);
    }
  }, [hasExistingSystems]);

  const triggerPing = async () => {
    if (!hasFigmaUrl || !hasToken || !figmaUrlValid) return;
    const requestSeq = pingRequestSeqRef.current + 1;
    pingRequestSeqRef.current = requestSeq;
    const pingUrl = figmaFileUrl.trim();
    const pingToken = figmaAccessToken.trim();
    setPingLoading(true);
    setPingResult(null);
    try {
      const result = await pingFigmaFile({
        figmaUrl: pingUrl,
        figmaToken: pingToken,
      });
      if (requestSeq !== pingRequestSeqRef.current) return;
      setPingResult(result);
    } catch (error) {
      if (requestSeq !== pingRequestSeqRef.current) return;
      if (error instanceof ApiError) {
        setPingResult({
          ok: false,
          code: error.code,
          message: error.message || "Credential validation failed.",
        });
      } else {
        setPingResult({
          ok: false,
          code: "ping.client_error",
          message: "Could not reach the server to validate credentials.",
        });
      }
    } finally {
      if (requestSeq === pingRequestSeqRef.current) {
        setPingLoading(false);
      }
    }
  };

  const doCreate = async () => {
    setSaving(true);
    setSaveError(null);
    setCaptureProgress(null);
    setShowImportProgressModal(false);
    setImportCompleted(false);
    setImportError(null);
    setImportErrorDetails("");
    setShowImportErrorDetails(false);
    setImportFigmaError(null);
    setImportPipelinePhase("");
    setImportSourceUrl("");
    setImportSourceFileKey("");
    setImportJobId("");
    setImportRequestId("");
    setIsCancellingImport(false);
    setImportControlNotice("");
    setImportTokensBootstrap(null);
    setImportTokensCompile(null);
    setImportSuccessSummary(null);
    try {
      const response = await createDesignSystem({
        id: generatedSystemId,
        name: systemName.trim(),
        appName: appName.trim() || undefined,
        figmaFileId: figmaFileId.trim() || undefined,
        figmaApiToken: undefined,
        inputDir: safeInputDir,
        outputDir: safeOutputDir,
        docsDir: safeDocsDir,
        compileVariablesOnCapture,
        makeDefault,
      });

      const trimmedUrl = toDocumentWideFigmaUrl(figmaFileUrl);
      let captureFinishedOk = false;
      if (trimmedUrl) {
        const sourceUrl = trimmedUrl;
        const sourceFileKey = extractFigmaFileIdFromUrl(sourceUrl);
        setImportSourceUrl(sourceUrl);
        setImportSourceFileKey(sourceFileKey);
        setShowImportProgressModal(true);
        const runtimeToken = figmaAccessToken.trim();
        try {
          const captureRequestBase = {
            figmaUrl: trimmedUrl,
            figmaToken: runtimeToken || undefined,
            includeVariants: false,
            requireExistingDoc: false,
            continueOnError: true,
            refreshIndices: true,
          } as const;
          const captureOptions = {
            systemId: response.system.id,
            onProgress: (progress: CaptureFigmaProgress) => {
              setCaptureProgress(progress);
              if (progress.jobId) {
                setImportJobId(progress.jobId);
              }
            },
          } as const;
          let captureResult = await captureFigmaScreenshot(
            {
              ...captureRequestBase,
              componentKind: "component_set",
            },
            captureOptions,
          );
          if (hasNoCaptureTargets(captureResult)) {
            setImportControlNotice(
              "No component sets detected; retrying import with single components.",
            );
            captureResult = await captureFigmaScreenshot(
              {
                ...captureRequestBase,
                componentKind: "component",
              },
              captureOptions,
            );
          }
          if (captureResult.jobId) {
            setImportJobId(captureResult.jobId);
          }
          if (captureResult.tokens_bootstrap) {
            setImportTokensBootstrap(captureResult.tokens_bootstrap);
          }
          if (captureResult.tokens_compile) {
            setImportTokensCompile(captureResult.tokens_compile);
          }
          // In dashboard server mode this endpoint is queued and returns 202 + jobId.
          // Keep strict validation only when a synchronous capture payload is returned.
          const hasDetailedCaptureResult =
            captureResult.targets_total !== undefined ||
            Array.isArray(captureResult.targets) ||
            Array.isArray(captureResult.captured) ||
            Array.isArray(captureResult.failed) ||
            Array.isArray(captureResult.skipped);

          const targetsCount =
            captureResult.targets_total ??
            captureResult.targets?.length ??
            0;
          const capturedCount = captureResult.captured?.length ?? 0;
          const failedCount = captureResult.failed?.length ?? 0;
          const capturePipelinePhase = toCapturePipelinePhase(captureResult.pipeline_phase);
          const captureFailureDetail =
            formatCaptureFigmaErrorMessage(captureResult.figma_error || null) ||
            captureResult.error ||
            captureResult.message ||
            captureResult.stderr ||
            captureResult.failed?.[0]?.error ||
            captureResult.registry_refresh?.stderr ||
            "";

          if (!hasDetailedCaptureResult) {
            throw buildPhaseAwareError({
              message:
                captureFailureDetail || "The import job finished without a detailed result payload.",
              pipelinePhase: capturePipelinePhase,
              figmaError: captureResult.figma_error || null,
            });
          }

          if (!captureResult.ok) {
            throw buildPhaseAwareError({
              message: captureFailureDetail || "Initial Figma import failed.",
              pipelinePhase: capturePipelinePhase,
              figmaError: captureResult.figma_error || null,
            });
          }

          if (
            targetsCount > 0 &&
            capturedCount === 0 &&
            failedCount > 0
          ) {
            throw buildPhaseAwareError({
              message:
                captureFailureDetail ||
                "Targets were found but every capture failed.",
              pipelinePhase: capturePipelinePhase,
              figmaError: captureResult.figma_error || null,
            });
          }

          if (targetsCount === 0 && capturedCount === 0) {
            throw buildPhaseAwareError({
              message: "No capturable components were found for the provided URL.",
              pipelinePhase: capturePipelinePhase,
              figmaError: captureResult.figma_error || null,
            });
          }
          setImportSuccessSummary(buildImportSuccessSummary(captureResult));
          captureFinishedOk = true;
        } catch (error) {
          const queueStatus = toNonEmptyString(
            error instanceof ApiError ? error.context?.status : "",
          ).toLowerCase();
          const cancelledByUser =
            error instanceof ApiError &&
            error.code === "queue.job_failed_or_cancelled" &&
            (queueStatus === "cancelled" || queueStatus === "canceled");
          if (cancelledByUser) {
            setCaptureProgress((current) =>
              current
                ? {
                    ...current,
                    status: "cancelled",
                    message: "Cancelled by user",
                  }
                : {
                    jobId: undefined,
                    status: "cancelled",
                    completed: 0,
                    total: 0,
                    remaining: 0,
                    message: "Cancelled by user",
                  },
            );
            setImportError(null);
            setImportErrorDetails("");
            setShowImportErrorDetails(false);
            setImportFigmaError(null);
            setImportPipelinePhase("");
            setSaveError(null);
            if (error.requestId) {
              setImportRequestId(error.requestId);
            }
          } else {
            const details = getCaptureErrorMessage(error);
            const technicalDetails = getCaptureErrorDetails(error);
            const figmaErrorDetail =
              error instanceof ApiError
                ? extractCaptureFigmaErrorDetail(error.payload)
                : extractPhaseAwareCaptureFigmaError(error);
            const pipelinePhase =
              error instanceof ApiError
                ? extractCapturePipelinePhase(error.payload)
                : toPipelinePhaseFromError(error);
            setImportError(details);
            setImportErrorDetails(technicalDetails);
            setImportFigmaError(figmaErrorDetail);
            setImportPipelinePhase(pipelinePhase);
            if (error instanceof ApiError) {
              setImportRequestId(error.requestId || "");
            }
            setShowImportErrorDetails(false);
            setSaveError(
              makeInlineErrorDisplay({
                title: "System created with warnings",
                message: `Initial Figma import failed: ${details}`,
                action: 'Retry from "Import Components from Figma".',
              }),
            );
          }
        }
      }

      if (trimmedUrl) {
        // Keep current active system during import to avoid remounting this page,
        // which closes the progress/error modal before details are visible.
        replaceSystems(response.config.systems);
      } else {
        replaceSystems(response.config.systems, { activeSystemId: response.system.id });
      }
      setSavedSystemId(response.system.id);
      if (trimmedUrl && captureFinishedOk) {
        try {
          await refreshTokenGraph();
          window.dispatchEvent(
            new CustomEvent("ds:token-graph-refreshed", {
              detail: { systemId: response.system.id, source: "new-system-import" },
            }),
          );
        } catch (error) {
          const details =
            error instanceof ApiError
              ? error.message || "Token graph refresh failed."
              : "Token graph refresh failed.";
          setImportControlNotice(
            `Import finished, but token graph could not be generated automatically: ${details}`,
          );
        }
        setImportCompleted(true);
      }
      if (!trimmedUrl) {
        navigate("/components");
      }
    } catch (error) {
      setSaveError(
        toApiErrorDisplay(error, {
          fallbackTitle: "System creation failed",
          fallbackMessage: "Unable to create design system.",
        }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleCancelImport = async () => {
    if (!importJobId || isCancellingImport || !isImportCancelable) return;
    setIsCancellingImport(true);
    setImportControlNotice("");
    try {
      await cancelQueueJob(importJobId);
      setCaptureProgress((current) =>
        current?.status === "cancelled"
          ? current
          : current
            ? {
                ...current,
                status: "cancelled",
                message: "Cancel requested",
              }
            : {
                jobId: importJobId,
                status: "cancelled",
                completed: 0,
                total: 0,
                remaining: 0,
                message: "Cancel requested",
              },
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "queue.job_not_cancelable") {
        setImportControlNotice("Import is already completing and can no longer be stopped.");
        return;
      }
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      setImportError(`Unable to stop import: ${message || "Unknown error"}`);
      setImportErrorDetails(getCaptureErrorDetails(error));
      setImportFigmaError(
        error instanceof ApiError
          ? extractCaptureFigmaErrorDetail(error.payload)
          : extractPhaseAwareCaptureFigmaError(error),
      );
      setImportPipelinePhase(error instanceof ApiError ? extractCapturePipelinePhase(error.payload) : "");
      setShowImportErrorDetails(false);
      if (error instanceof ApiError && error.requestId) {
        setImportRequestId(error.requestId);
      }
    } finally {
      setIsCancellingImport(false);
    }
  };

  const handleCreateSystem = async () => {
    if (!canSave) return;
    setSaveError(null);
    await doCreate();
  };

  return (
    <div className="mx-auto max-w-4xl py-8">
      <h1 className="mb-4 text-3xl font-serif font-bold tracking-tight">Add New Design System</h1>
      <p className="mb-8 text-muted-foreground">
        Configure the system directly from this page. If collections are empty, they will be filled
        automatically on the first successful Figma capture.
      </p>

      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-xl font-serif font-semibold">1. System Configuration</h2>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Figma file URL
              </label>
              <Input
                placeholder="https://www.figma.com/design/..."
                value={figmaFileUrl}
                onChange={(e) => {
                  setFigmaFileUrl(e.target.value);
                  pingRequestSeqRef.current += 1;
                  setPingLoading(false);
                  setPingResult(null);
                }}
                onBlur={triggerPing}
              />
              <p className="text-[11px] text-muted-foreground">
                Full document import: if URL includes <code>node-id</code>, it will be ignored.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System name
              </label>
              <Input
                placeholder="e.g. My Design System"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
              />
              {hasNameCollision ? (
                <p className="text-[11px] text-status-error">
                  A system named "{collidingSystem?.name}" already exists. Choose a different name.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Figma access token (for initial import)
              </label>
              <Input
                type="password"
                placeholder="figd_..."
                value={figmaAccessToken}
                onChange={(e) => {
                  setFigmaAccessToken(e.target.value);
                  pingRequestSeqRef.current += 1;
                  setPingLoading(false);
                  setPingResult(null);
                }}
                onBlur={triggerPing}
              />
              <p className="text-[11px] text-muted-foreground">
                Used only to run the first capture right after creation.
              </p>
              {hasFigmaUrl && !hasToken ? (
                <p className="text-[11px] text-status-warning">
                  A token is required when a Figma URL is provided.
                </p>
              ) : null}
              {pingLoading ? (
                <p className="text-[11px] text-muted-foreground">Checking access…</p>
              ) : pingResult && hasFigmaUrl && hasToken ? (
                pingResult.ok ? (
                  <div className="space-y-1">
                    <p className="text-[11px] text-status-success">
                      ✓ Access confirmed — {pingResult.fileName}
                    </p>
                    {pingResult.code === "figma.variables_scope_missing" ? (
                      <p className="text-[11px] text-status-warning">
                        Variables will sync through direct plugin connection (REST variables scope is not available).
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-[11px] text-status-error">
                    ✗ {pingResult.message}
                  </p>
                )
              ) : null}
              <FigmaMcpConnectionTestButton
                figmaUrl={figmaFileUrl}
                figmaToken={figmaAccessToken}
                className="mt-2"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                App name
              </label>
              <Input
                placeholder="defaults to system name"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                System id
              </label>
              <Input
                placeholder="auto-generated from name"
                value={systemIdOverride}
                onChange={(e) => setSystemIdOverride(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Resolved id: <code>{generatedSystemId || "—"}</code>
              </p>
            </div>

          </div>

          <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compileVariablesOnCapture}
              onChange={(e) => setCompileVariablesOnCapture(e.target.checked)}
              className="h-4 w-4"
            />
            <span>
              Compile Figma variables to design tokens on first capture
            </span>
          </label>

          {hasExistingSystems ? (
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => setMakeDefault(e.target.checked)}
                className="h-4 w-4"
              />
              Set as active system after creation
            </label>
          ) : null}

          {saveError ? (
            <ApiErrorMessage error={saveError} className="mt-3" />
          ) : null}

          <div className="mt-4 flex items-center gap-3">
            <Button onClick={handleCreateSystem} disabled={!canSave}>
              {saving ? "Saving..." : "Create system"}
            </Button>
            {saving && hasFigmaUrl && showImportProgressModal ? (
              <span className="text-sm text-muted-foreground">
                {`Importing from Figma: ${importStatusText}`}
              </span>
            ) : null}
            {savedSystemId ? (
              <span className="text-sm text-status-success">
                Saved as <code>{savedSystemId}</code>
              </span>
            ) : null}
          </div>
          {pingValidationPending ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Figma access has not been validated yet. Creation will continue and import will still run.
            </p>
          ) : null}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-serif font-semibold">2. Import Components from Figma</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            After creating the system, run a capture from the Components page to bootstrap docs and
            make the system operational in the sidebar.
          </p>
          <Link
            to="/components"
            className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
          >
            Open Components Capture
          </Link>
        </section>
      </div>

      <Modal
        open={showImportProgressModal}
        onClose={() => {
          setShowImportProgressModal(false);
          if (savedSystemId) {
            setActiveSystem(savedSystemId);
          }
        }}
      >
        <ModalContent size="lg">
          <div className="p-5">
            <h2 className="text-lg font-serif font-semibold">
              Importing from Figma
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {importStatusText}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {`Components: ${importProgressSummary.componentsImported} of ${importProgressSummary.componentsDetected} imported.`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {`Variables: ${importProgressSummary.variablesImported} of ${importProgressSummary.variablesDetected} imported.`}
            </p>
            {importControlNotice ? (
              <p className="mt-2 text-xs text-status-warning">
                {importControlNotice}
              </p>
            ) : null}
            {importCurrentSlug ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Current component: <code>{importCurrentSlug}</code>
              </p>
            ) : null}
            <p className="mt-2 break-all text-xs text-muted-foreground">
              Source URL: <code>{importSourceUrl || "n/a"}</code>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              File key: <code>{importSourceFileKey || "n/a"}</code>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Job ID: <code>{importJobId || "n/a"}</code>
            </p>
            {importRequestId ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Request ID: <code>{importRequestId}</code>
              </p>
            ) : null}

            {importError ? (
              <StatusAlert
                variant="error"
                description={
                  <>
                    <p>{importError}</p>
                    <p className="mt-2 text-xs text-status-error">
                      No components or design tokens were generated because the import failed.
                    </p>
                    {importPipelinePhase ? (
                      <p className="mt-2 text-xs text-status-error">
                        Pipeline phase: <code>{importPipelinePhase}</code>
                      </p>
                    ) : null}
                    {importFigmaError ? (
                      <div className="mt-2 space-y-1 text-xs text-status-error">
                        {typeof importFigmaError.status === "number" ? (
                          <p>
                            Figma status: <code>{importFigmaError.status}</code>
                          </p>
                        ) : null}
                        {importFigmaError.fileKey ? (
                          <p>
                            File key: <code>{importFigmaError.fileKey}</code>
                          </p>
                        ) : null}
                        {importFigmaError.endpoint ? (
                          <p className="break-all">
                            Endpoint: <code>{importFigmaError.endpoint}</code>
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    {importErrorHint ? (
                      <p className="mt-2 text-xs text-status-error">
                        {importErrorHint}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowImportErrorDetails((current) => !current)}
                      >
                        {showImportErrorDetails ? "Hide error details" : "View error details"}
                      </Button>
                    </div>
                    {showImportErrorDetails ? (
                      <pre className="mt-3 max-h-64 overflow-auto rounded-md border border-status-error-border/30 bg-black/10 p-3 text-xs text-status-error">
                        {importErrorDetails || importError}
                      </pre>
                    ) : null}
                  </>
                }
              />
            ) : null}

            {importTokensBootstrap ? (
              bootstrapHasCriticalFailure ? (
                <StatusAlert
                  variant="warning"
                  title="Token bootstrap failed"
                  description={
                    <>
                      <p className="mt-1 text-xs text-status-warning">
                        Figma variables could not be initialized into the system input directory.
                      </p>
                      <p className="mt-1 text-xs">{bootstrapReasonMessage}</p>
                      {bootstrapErrorHint ? (
                        <p className="mt-1 text-xs text-status-warning">
                          {bootstrapErrorHint}
                        </p>
                      ) : null}
                      {importTokensBootstrap.error ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-status-warning-border/30 bg-black/10 p-2 text-xs text-status-warning">
                          {importTokensBootstrap.error}
                        </pre>
                      ) : null}
                    </>
                  }
                />
              ) : importTokensBootstrap.created ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Figma variables were bootstrapped into input JSON files.
                </p>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {bootstrapReasonMessage}
                </p>
              )
            ) : null}

            {importTokensCompile && !bootstrapHasCriticalFailure ? (
              tokensCompiled ? (
                <p className="mt-3 text-sm text-status-success">
                  ✓ Design tokens compiled successfully.
                </p>
              ) : tokensAttempted ? (
                <StatusAlert
                  variant="warning"
                  title="Token compilation failed"
                  description={
                    <>
                      <p className="mt-1 text-xs text-status-warning">
                        The Tokens page will not be available until compilation succeeds.
                      </p>
                      <p className="mt-1 text-xs">{compileReasonMessage}</p>
                      {importTokensCompile.stderr ? (
                        <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-status-warning-border/30 bg-black/10 p-2 text-xs text-status-warning">
                          {importTokensCompile.stderr}
                        </pre>
                      ) : null}
                    </>
                  }
                />
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">
                  {compileReasonMessage}
                </p>
              )
            ) : null}

            {importCompleted && !importError && importSuccessSummary ? (
              <ImportSuccessNotice summary={importSuccessSummary} />
            ) : null}

            {importCompleted && !importError ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {canShowTokensLink ? (
                  <Link
                    to="/tokens"
                    className={cn(buttonVariants({ variant: "default" }))}
                  >
                    View Design Tokens
                  </Link>
                ) : null}
                <Link
                  to="/components"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  View components
                </Link>
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              {isImportCancelable ? (
                <Button
                  variant="outline"
                  className="border-status-error-border/40 text-status-error hover:bg-status-error-bg/10"
                  onClick={handleCancelImport}
                  disabled={isCancellingImport}
                >
                  {isCancellingImport ? "Stopping..." : "Stop Import"}
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => {
                  setShowImportProgressModal(false);
                  if (savedSystemId) {
                    setActiveSystem(savedSystemId);
                  }
                }}
                disabled={saving && !importError && !importCompleted}
              >
                Close
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>

    </div>
  );
}
