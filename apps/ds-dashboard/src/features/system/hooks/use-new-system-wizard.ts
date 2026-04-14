import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { createDesignSystem, scanFigmaComponents } from "@/lib/api";
import { toApiErrorDisplay, type ApiErrorDisplay } from "@/lib/api-error-ux";
import { useDesignSystem } from "@/lib/design-system-context";
import type { CaptureFigmaProgress } from "@/lib/api";
import type { ImportSuccessSummary } from "@/features/system/new-system-import-summary";
import {
  extractFigmaFileIdFromUrl,
  toDocumentWideFigmaUrl,
  toSystemId,
} from "../lib/new-system-transforms";

type WizardStep = "basics" | "importing" | "done";

/** Scan state machine: idle → loading → ready|error|empty */
export type ScanState = "idle" | "loading" | "ready" | "error" | "empty";

export interface ScannedComponent {
  nodeId: string;
  name: string;
  pageName: string;
}

export interface ScanResult {
  state: ScanState;
  components: ScannedComponent[];
  truncated: boolean;
  limit: number;
  total: number;
  error: string | null;
  errorNonce: number;
}

interface WizardFormState {
  systemName: string;
  appName: string;
  figmaFileUrl: string;
  figmaAccessToken: string;
  compileVariablesOnCapture: boolean;
  makeDefault: boolean;
  systemIdOverride: string;
}

interface WizardImportState {
  jobId: string;
  makeDefault: boolean;
  systemsSnapshot: Array<{ id: string; name: string }>;
  progress: CaptureFigmaProgress | null;
  error: string | null;
  errorDetails: string;
  pipelinePhase: string;
  sourceUrl: string;
  sourceFileKey: string;
  successSummary: ImportSuccessSummary | null;
  importMode: "full" | "partial";
  selectedCount: number;
  notSelectedCount: number;
  selectedComponentNodeIds: string[];
}

interface WizardState {
  step: WizardStep;
  form: WizardFormState;
  import: WizardImportState;
  scan: ScanResult;
  selectedComponentNodeIds: Set<string>;
}

type WizardAction =
  | { type: "SET_FORM_FIELD"; field: keyof WizardFormState; value: string | boolean }
  | { type: "SCAN_START" }
  | {
    type: "SCAN_SUCCESS";
    payload: { components: ScannedComponent[]; truncated: boolean; limit: number; total: number };
  }
  | { type: "SCAN_ERROR"; payload: string }
  | { type: "TOGGLE_COMPONENT"; nodeId: string }
  | { type: "SELECT_ALL" }
  | { type: "DESELECT_ALL" }
  | { type: "RESET_SCAN" }
  | {
    type: "START_IMPORT";
    payload: {
      jobId: string;
      sourceUrl: string;
      sourceFileKey: string;
      makeDefault: boolean;
      systemsSnapshot: Array<{ id: string; name: string }>;
      importMode: "full" | "partial";
      selectedCount: number;
      notSelectedCount: number;
      selectedComponentNodeIds: string[];
    };
  }
  | { type: "IMPORT_PROGRESS"; payload: CaptureFigmaProgress }
  | { type: "IMPORT_SUCCESS"; payload: ImportSuccessSummary }
  | { type: "IMPORT_ERROR"; payload: { message: string; details: string; pipelinePhase?: string } }
  | { type: "CANCEL_IMPORT" }
  | { type: "RESET" };

const emptyScan: ScanResult = {
  state: "idle",
  components: [],
  truncated: false,
  limit: 0,
  total: 0,
  error: null,
  errorNonce: 0,
};

const initialState: WizardState = {
  step: "basics",
  form: {
    systemName: "",
    appName: "",
    figmaFileUrl: "",
    figmaAccessToken: "",
    compileVariablesOnCapture: true,
    makeDefault: false,
    systemIdOverride: "",
  },
  import: {
    jobId: "",
    makeDefault: false,
    systemsSnapshot: [],
    progress: null,
    error: null,
    errorDetails: "",
    pipelinePhase: "",
    sourceUrl: "",
    sourceFileKey: "",
    successSummary: null,
    importMode: "full",
    selectedCount: 0,
    notSelectedCount: 0,
    selectedComponentNodeIds: [],
  },
  scan: emptyScan,
  selectedComponentNodeIds: new Set(),
};

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_FORM_FIELD":
      return { ...state, form: { ...state.form, [action.field]: action.value } };

    case "SCAN_START":
      return { ...state, scan: { ...emptyScan, state: "loading" }, selectedComponentNodeIds: new Set() };

    case "SCAN_SUCCESS": {
      const components = action.payload.components;
      return {
        ...state,
        scan: {
          state: components.length === 0 ? "empty" : "ready",
          components,
          truncated: action.payload.truncated,
          limit: action.payload.limit,
          total: action.payload.total,
          error: null,
          errorNonce: state.scan.errorNonce,
        },
        selectedComponentNodeIds: new Set(),
      };
    }

    case "SCAN_ERROR":
      return {
        ...state,
        scan: {
          ...emptyScan,
          state: "error",
          error: action.payload,
          errorNonce: state.scan.errorNonce + 1,
        },
      };

    case "TOGGLE_COMPONENT": {
      const next = new Set(state.selectedComponentNodeIds);
      if (next.has(action.nodeId)) {
        next.delete(action.nodeId);
      } else {
        next.add(action.nodeId);
      }
      return { ...state, selectedComponentNodeIds: next };
    }

    case "SELECT_ALL":
      return {
        ...state,
        selectedComponentNodeIds: new Set(state.scan.components.map((c) => c.nodeId)),
      };

    case "DESELECT_ALL":
      return { ...state, selectedComponentNodeIds: new Set() };

    case "RESET_SCAN":
      return { ...state, scan: emptyScan, selectedComponentNodeIds: new Set() };

    case "START_IMPORT":
      if (!action.payload.jobId.trim()) {
        return state;
      }
      return {
        ...state,
        step: "importing",
        import: {
          ...initialState.import,
          jobId: action.payload.jobId,
          makeDefault: action.payload.makeDefault,
          systemsSnapshot: action.payload.systemsSnapshot,
          sourceUrl: action.payload.sourceUrl,
          sourceFileKey: action.payload.sourceFileKey,
          importMode: action.payload.importMode,
          selectedCount: action.payload.selectedCount,
          notSelectedCount: action.payload.notSelectedCount,
          selectedComponentNodeIds: action.payload.selectedComponentNodeIds,
        },
      };

    case "IMPORT_PROGRESS":
      return { ...state, import: { ...state.import, progress: action.payload } };
    case "IMPORT_SUCCESS":
      return {
        ...state,
        step: "done",
        import: { ...state.import, successSummary: action.payload },
      };
    case "IMPORT_ERROR":
      return {
        ...state,
        import: {
          ...state.import,
          error: action.payload.message,
          errorDetails: action.payload.details,
          pipelinePhase: action.payload.pipelinePhase || "",
        },
      };
    case "CANCEL_IMPORT":
      return { ...state, step: "basics", import: initialState.import, scan: emptyScan, selectedComponentNodeIds: new Set() };
    case "RESET":
      return { ...initialState, scan: emptyScan, selectedComponentNodeIds: new Set() };
    default:
      return state;
  }
}

interface NewSystemWizardViewModel {
  step: WizardStep;
  form: WizardFormState;
  importState: WizardImportState;
  scan: ScanResult;
  selectedComponentNodeIds: Set<string>;
  generatedSystemId: string;
  figmaFileId: string;
  isFormValid: boolean;
  canSelectAll: boolean;
  hasSelection: boolean;
  isImporting: boolean;
  importCompleted: boolean;
  saving: boolean;
  saveError: ApiErrorDisplay | null;
  showImportErrorDetails: boolean;
  isCancellingImport: boolean;
  setFormField: (field: keyof WizardFormState, value: string | boolean) => void;
  handleScan: () => Promise<void>;
  handleImportDesignSystem: () => Promise<void>;
  toggleComponent: (nodeId: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateImportProgress: (progress: CaptureFigmaProgress) => void;
  completeImport: (summary: ImportSuccessSummary) => void;
  failImport: (message: string, details: string, pipelinePhase?: string) => void;
  cancelImport: () => void;
  resetWizard: () => void;
  toggleImportErrorDetails: () => void;
}

export function useNewSystemWizard(): NewSystemWizardViewModel {
  const { replaceSystems, systems } = useDesignSystem();
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiErrorDisplay | null>(null);
  const [showImportErrorDetails, setShowImportErrorDetails] = useState(false);
  const [isCancellingImport, setIsCancellingImport] = useState(false);
  const replaceSystemsRef = useRef(replaceSystems);
  const latestImportRef = useRef(state.import);

  useEffect(() => {
    replaceSystemsRef.current = replaceSystems;
  }, [replaceSystems]);

  useEffect(() => {
    latestImportRef.current = state.import;
  }, [state.import]);

  const generatedSystemId = useMemo(() => toSystemId(state.form.systemName), [state.form.systemName]);
  const figmaFileId = useMemo(() => extractFigmaFileIdFromUrl(state.form.figmaFileUrl), [state.form.figmaFileUrl]);
  const isFormValid = useMemo(
    () => state.form.systemName.trim().length > 0 && state.form.figmaFileUrl.trim().length > 0 && figmaFileId.length > 0,
    [state.form.systemName, state.form.figmaFileUrl, figmaFileId],
  );
  const canSelectAll = state.scan.state === "ready" && !state.scan.truncated && state.scan.components.length > 0;
  const hasSelection = state.selectedComponentNodeIds.size > 0;
  const isImporting = state.step === "importing";
  const importCompleted = state.step === "done";
  const isSystemNameTaken = useCallback(
    (name: string) => {
      const normalized = String(name || "").trim().toLowerCase();
      if (!normalized) return false;
      return systems.some((entry) => String(entry.name || "").trim().toLowerCase() === normalized);
    },
    [systems],
  );

  const setFormField = useCallback((field: keyof WizardFormState, value: string | boolean) => {
    dispatch({ type: "SET_FORM_FIELD", field, value });
  }, []);

  const handleScan = useCallback(async () => {
    const validationErrors: string[] = [];
    const systemName = state.form.systemName.trim();
    const figmaUrl = state.form.figmaFileUrl.trim();
    const systemIdFromName = toSystemId(systemName);
    const fileId = extractFigmaFileIdFromUrl(figmaUrl);

    if (!systemName) {
      validationErrors.push("System name is required.");
    } else if (!systemIdFromName) {
      validationErrors.push("System name is invalid. Use at least one alphanumeric character.");
    } else {
      if (isSystemNameTaken(systemName)) {
        validationErrors.push("System name is already in use. Use a different name.");
      }
    }

    if (!figmaUrl) {
      validationErrors.push("Figma file URL is required.");
    } else if (!fileId) {
      validationErrors.push("Figma file URL is invalid. Paste a valid Figma file URL.");
    }

    if (validationErrors.length > 0) {
      dispatch({ type: "SCAN_ERROR", payload: validationErrors.join("\n") });
      return;
    }

    dispatch({ type: "SCAN_START" });

    try {
      const figmaToken = state.form.figmaAccessToken.trim() || undefined;
      const allComponents = new Map<string, ScannedComponent>();
      let total = 0;
      let limit = 500;
      let truncated = false;
      let offset = 0;
      const scanSessionId =
        typeof globalThis.crypto?.randomUUID === "function"
          ? globalThis.crypto.randomUUID()
          : `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const maxPages = 50;
      let page = 0;
      let hitMaxPages = false;

      do {
        page += 1;
        const result = await scanFigmaComponents({
          figmaUrl,
          figmaToken,
          limit: 500,
          offset,
          scanSessionId,
        });

        for (const c of result.components) {
          if (!allComponents.has(c.nodeId)) {
            allComponents.set(c.nodeId, c);
          }
        }

        total = result.total;
        limit = result.limit;
        truncated = result.truncated;

        if (result.totalIsEstimated) {
          truncated = true;
          break;
        }

        if (result.hasMore && result.nextOffset !== null) {
          offset = result.nextOffset;
        } else {
          break;
        }

        if (page >= maxPages) {
          hitMaxPages = true;
          break;
        }
      } while (page < maxPages);

      // If we hit the max pages guardrail, mark as truncated
      if (hitMaxPages) {
        truncated = true;
      }

      dispatch({
        type: "SCAN_SUCCESS",
        payload: {
          components: Array.from(allComponents.values()),
          truncated,
          limit,
          total,
        },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      dispatch({ type: "SCAN_ERROR", payload: message });
    }
  }, [isSystemNameTaken, state.form.figmaAccessToken, state.form.figmaFileUrl, state.form.systemName]);

  const handleImportDesignSystem = useCallback(async () => {
    if (!isFormValid) return;
    setSaving(true);
    setSaveError(null);

    try {
      if (isSystemNameTaken(state.form.systemName)) {
        throw new Error("System name is already in use. Use a different name.");
      }

      const capturedSelection = new Set(state.selectedComponentNodeIds);
      const capturedScan = state.scan;
      const systemId = state.form.systemIdOverride.trim() || generatedSystemId;
      const safeInputDir = `design-systems/${systemId}/input`;
      const documentWideUrl = toDocumentWideFigmaUrl(state.form.figmaFileUrl);
      const sourceFileKey = extractFigmaFileIdFromUrl(state.form.figmaFileUrl);

      const hasSelection = capturedSelection.size > 0;
      const isSelectionSubset =
        capturedScan.state === "ready" &&
        capturedScan.components.length > 0 &&
        capturedSelection.size < capturedScan.components.length;
      const isPartial = hasSelection && isSelectionSubset;

      const result = await createDesignSystem({
        id: systemId,
        name: state.form.systemName.trim(),
        appName: state.form.appName.trim() || undefined,
        figmaFileId: sourceFileKey,
        figmaApiToken: state.form.figmaAccessToken.trim() || undefined,
        inputDir: safeInputDir,
        compileVariablesOnCapture: state.form.compileVariablesOnCapture,
        makeDefault: state.form.makeDefault,
      });

      if (!result.ok || !result.system || !result.config) {
        throw new Error("Failed to create system");
      }
      if (!result.system.id.trim()) {
        throw new Error("Server returned an empty system ID");
      }

      // Refresh systems list immediately after creation without switching active system yet.
      // Active system switching remains coordinated via import snapshot restoration.
      replaceSystemsRef.current(result.config.systems);

      const importMode = isPartial ? "partial" : "full";
      const selectedCount = isPartial ? capturedSelection.size : capturedScan.components.length;
      const notSelectedCount = isPartial ? Math.max(0, capturedScan.components.length - selectedCount) : 0;
      const selectedComponentNodeIds = isPartial ? Array.from(capturedSelection) : [];

      dispatch({
        type: "START_IMPORT",
        payload: {
          jobId: result.system.id,
          makeDefault: state.form.makeDefault,
          systemsSnapshot: result.config.systems,
          sourceUrl: documentWideUrl,
          sourceFileKey,
          importMode,
          selectedCount,
          notSelectedCount,
          selectedComponentNodeIds,
        },
      });
    } catch (cause) {
      setSaveError(
        toApiErrorDisplay(cause, {
          fallbackTitle: "Create failed",
          fallbackMessage: "Unable to create system",
        }),
      );
    } finally {
      setSaving(false);
    }
  }, [generatedSystemId, isFormValid, isSystemNameTaken, state.form, state.scan, state.selectedComponentNodeIds]);

  const toggleComponent = useCallback((nodeId: string) => {
    dispatch({ type: "TOGGLE_COMPONENT", nodeId });
  }, []);

  const selectAll = useCallback(() => {
    dispatch({ type: "SELECT_ALL" });
  }, []);

  const deselectAll = useCallback(() => {
    dispatch({ type: "DESELECT_ALL" });
  }, []);

  const updateImportProgress = useCallback((progress: CaptureFigmaProgress) => {
    dispatch({ type: "IMPORT_PROGRESS", payload: progress });
  }, []);

  const restoreSystemsSnapshot = useCallback((options?: { activateImportedSystem?: boolean }) => {
    // Intentionally reads from refs to avoid stale closure and to keep this callback stable.
    // A reactive dependency list here can retrigger import side-effects while the wizard is running.
    const snapshot = latestImportRef.current;
    if (snapshot.systemsSnapshot.length === 0) return;
    const shouldActivateImportedSystem = options?.activateImportedSystem === true;
    const activeSystemId =
      shouldActivateImportedSystem || snapshot.makeDefault
        ? snapshot.jobId
        : undefined;
    replaceSystemsRef.current(
      snapshot.systemsSnapshot,
      activeSystemId ? { activeSystemId } : undefined,
    );
  }, []);

  const completeImport = useCallback((summary: ImportSuccessSummary) => {
    restoreSystemsSnapshot({ activateImportedSystem: true });
    dispatch({ type: "IMPORT_SUCCESS", payload: summary });
  }, [restoreSystemsSnapshot]);

  const failImport = useCallback((message: string, details: string, pipelinePhase?: string) => {
    dispatch({ type: "IMPORT_ERROR", payload: { message, details, pipelinePhase } });
  }, []);

  const cancelImport = useCallback(() => {
    restoreSystemsSnapshot();
    dispatch({ type: "CANCEL_IMPORT" });
  }, [restoreSystemsSnapshot]);

  const resetWizard = useCallback(() => {
    restoreSystemsSnapshot();
    dispatch({ type: "RESET" });
    setSaveError(null);
    setShowImportErrorDetails(false);
  }, [restoreSystemsSnapshot]);

  const toggleImportErrorDetails = useCallback(() => {
    setShowImportErrorDetails((value) => !value);
  }, []);

  return {
    step: state.step,
    form: state.form,
    importState: state.import,
    scan: state.scan,
    selectedComponentNodeIds: state.selectedComponentNodeIds,
    generatedSystemId,
    figmaFileId,
    isFormValid,
    canSelectAll,
    hasSelection,
    isImporting,
    importCompleted,
    saving,
    saveError,
    showImportErrorDetails,
    isCancellingImport,
    setFormField,
    handleScan,
    handleImportDesignSystem,
    toggleComponent,
    selectAll,
    deselectAll,
    updateImportProgress,
    completeImport,
    failImport,
    cancelImport,
    resetWizard,
    toggleImportErrorDetails,
  };
}
