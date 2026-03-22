import { useCallback, useMemo, useReducer, useState } from "react";

import { createDesignSystem, pingFigmaFile, type FigmaPingResult } from "@/lib/api";
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
  progress: CaptureFigmaProgress | null;
  error: string | null;
  errorDetails: string;
  pipelinePhase: string;
  sourceUrl: string;
  sourceFileKey: string;
  successSummary: ImportSuccessSummary | null;
}

interface WizardState {
  step: WizardStep;
  form: WizardFormState;
  import: WizardImportState;
}

type WizardAction =
  | { type: "SET_FORM_FIELD"; field: keyof WizardFormState; value: string | boolean }
  | { type: "START_IMPORT"; payload: { jobId: string; sourceUrl: string; sourceFileKey: string } }
  | { type: "IMPORT_PROGRESS"; payload: CaptureFigmaProgress }
  | { type: "IMPORT_SUCCESS"; payload: ImportSuccessSummary }
  | { type: "IMPORT_ERROR"; payload: { message: string; details: string; pipelinePhase?: string } }
  | { type: "CANCEL_IMPORT" }
  | { type: "RESET" };

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
    progress: null,
    error: null,
    errorDetails: "",
    pipelinePhase: "",
    sourceUrl: "",
    sourceFileKey: "",
    successSummary: null,
  },
};

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "SET_FORM_FIELD":
      return { ...state, form: { ...state.form, [action.field]: action.value } };
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
          sourceUrl: action.payload.sourceUrl,
          sourceFileKey: action.payload.sourceFileKey,
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
      return { ...state, step: "basics", import: initialState.import };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface NewSystemWizardViewModel {
  step: WizardStep;
  form: WizardFormState;
  importState: WizardImportState;
  generatedSystemId: string;
  figmaFileId: string;
  isFormValid: boolean;
  isImporting: boolean;
  importCompleted: boolean;
  saving: boolean;
  saveError: ApiErrorDisplay | null;
  pingResult: FigmaPingResult | null;
  pingLoading: boolean;
  showImportErrorDetails: boolean;
  isCancellingImport: boolean;
  setFormField: (field: keyof WizardFormState, value: string | boolean) => void;
  handlePingTest: () => Promise<void>;
  handleSubmitBasics: () => Promise<void>;
  updateImportProgress: (progress: CaptureFigmaProgress) => void;
  completeImport: (summary: ImportSuccessSummary) => void;
  failImport: (message: string, details: string, pipelinePhase?: string) => void;
  cancelImport: () => void;
  resetWizard: () => void;
  toggleImportErrorDetails: () => void;
}

export function useNewSystemWizard(): NewSystemWizardViewModel {
  const [state, dispatch] = useReducer(wizardReducer, initialState);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<ApiErrorDisplay | null>(null);
  const [pingResult, setPingResult] = useState<FigmaPingResult | null>(null);
  const [pingLoading, setPingLoading] = useState(false);
  const [showImportErrorDetails, setShowImportErrorDetails] = useState(false);
  const [isCancellingImport, setIsCancellingImport] = useState(false);
  const { replaceSystems, setActiveSystem } = useDesignSystem();

  const generatedSystemId = useMemo(() => toSystemId(state.form.systemName), [state.form.systemName]);
  const figmaFileId = useMemo(() => extractFigmaFileIdFromUrl(state.form.figmaFileUrl), [state.form.figmaFileUrl]);
  const isFormValid = useMemo(
    () => state.form.systemName.trim().length > 0 && state.form.figmaFileUrl.trim().length > 0 && figmaFileId.length > 0,
    [state.form.systemName, state.form.figmaFileUrl, figmaFileId],
  );
  const isImporting = state.step === "importing";
  const importCompleted = state.step === "done";

  const setFormField = useCallback((field: keyof WizardFormState, value: string | boolean) => {
    dispatch({ type: "SET_FORM_FIELD", field, value });
  }, []);

  const handlePingTest = useCallback(async () => {
    if (!state.form.figmaFileUrl || !state.form.figmaAccessToken) return;
    setPingLoading(true);
    setPingResult(null);
    try {
      const result = await pingFigmaFile({
        figmaUrl: state.form.figmaFileUrl,
        figmaToken: state.form.figmaAccessToken,
      });
      setPingResult(result);
    } catch (cause) {
      setPingResult({ ok: false, message: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setPingLoading(false);
    }
  }, [state.form.figmaFileUrl, state.form.figmaAccessToken]);

  const handleSubmitBasics = useCallback(async () => {
    if (!isFormValid) return;
    setSaving(true);
    setSaveError(null);

    try {
      const systemId = state.form.systemIdOverride.trim() || generatedSystemId;
      const safeInputDir = `input/${systemId}`;
      const documentWideUrl = toDocumentWideFigmaUrl(state.form.figmaFileUrl);
      const sourceFileKey = extractFigmaFileIdFromUrl(state.form.figmaFileUrl);

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

      replaceSystems(result.config.systems);
      if (state.form.makeDefault) {
        setActiveSystem(systemId);
      }

      dispatch({
        type: "START_IMPORT",
        payload: {
          jobId: result.system.id,
          sourceUrl: documentWideUrl,
          sourceFileKey,
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
  }, [generatedSystemId, isFormValid, replaceSystems, setActiveSystem, state.form]);

  const updateImportProgress = useCallback((progress: CaptureFigmaProgress) => {
    dispatch({ type: "IMPORT_PROGRESS", payload: progress });
  }, []);

  const completeImport = useCallback((summary: ImportSuccessSummary) => {
    dispatch({ type: "IMPORT_SUCCESS", payload: summary });
  }, []);

  const failImport = useCallback((message: string, details: string, pipelinePhase?: string) => {
    dispatch({ type: "IMPORT_ERROR", payload: { message, details, pipelinePhase } });
  }, []);

  const cancelImport = useCallback(() => {
    dispatch({ type: "CANCEL_IMPORT" });
  }, []);

  const resetWizard = useCallback(() => {
    dispatch({ type: "RESET" });
    setSaveError(null);
    setPingResult(null);
    setShowImportErrorDetails(false);
  }, []);

  const toggleImportErrorDetails = useCallback(() => {
    setShowImportErrorDetails((value) => !value);
  }, []);

  return {
    step: state.step,
    form: state.form,
    importState: state.import,
    generatedSystemId,
    figmaFileId,
    isFormValid,
    isImporting,
    importCompleted,
    saving,
    saveError,
    pingResult,
    pingLoading,
    showImportErrorDetails,
    isCancellingImport,
    setFormField,
    handlePingTest,
    handleSubmitBasics,
    updateImportProgress,
    completeImport,
    failImport,
    cancelImport,
    resetWizard,
    toggleImportErrorDetails,
  };
}
