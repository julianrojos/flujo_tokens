/**
 * New System Page - orchestrator only.
 */

import { PageHeader } from "@/components/composites";
import { ApiErrorMessage } from "@/components/api-error-message";
import { useNewSystemWizard } from "./hooks/use-new-system-wizard";
import { WizardStepBasics } from "./components/wizard-step-basics";
import { WizardStepImport } from "./components/wizard-step-import";

export function NewSystemPage() {
  const {
    step,
    form,
    importState,
    generatedSystemId,
    figmaFileId,
    isFormValid,
    importCompleted,
    saving,
    saveError,
    pingResult,
    showImportErrorDetails,
    isCancellingImport,
    setFormField,
    handleSubmitBasics,
    cancelImport,
    resetWizard,
    toggleImportErrorDetails,
  } = useNewSystemWizard();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Create Design System"
        description="Import from Figma"
      />

      {saveError && <ApiErrorMessage error={saveError} />}

      {step === "basics" && (
        <WizardStepBasics
          form={form}
          derived={{
            generatedSystemId,
            figmaFileId,
            isFormValid,
            saving,
            pingResult,
          }}
          actions={{
            onFieldChange: setFormField,
            onSubmit: handleSubmitBasics,
          }}
        />
      )}

      {step === "importing" && (
        <WizardStepImport
          progress={importState.progress}
          error={importState.error}
          errorDetails={importState.errorDetails}
          pipelinePhase={importState.pipelinePhase}
          showDetails={showImportErrorDetails}
          isCancelling={isCancellingImport}
          importCompleted={importCompleted}
          onCancel={cancelImport}
          onReset={resetWizard}
          onToggleDetails={toggleImportErrorDetails}
        />
      )}

      {step === "done" && (
        <WizardStepImport
          progress={importState.progress}
          error={null}
          errorDetails=""
          pipelinePhase=""
          showDetails={showImportErrorDetails}
          isCancelling={false}
          importCompleted={true}
          onCancel={() => {}}
          onReset={resetWizard}
          onToggleDetails={toggleImportErrorDetails}
        />
      )}
    </div>
  );
}
