/**
 * Wizard Step Basics - form for Figma URL, token, system name, options.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FigmaMcpConnectionTestButton } from "@/components/figma-mcp-connection-test-button";

interface WizardFormValues {
  systemName: string;
  appName: string;
  figmaFileUrl: string;
  figmaAccessToken: string;
  compileVariablesOnCapture: boolean;
  makeDefault: boolean;
  systemIdOverride: string;
}

interface WizardBasicsDerived {
  generatedSystemId: string;
  figmaFileId: string;
  isFormValid: boolean;
  saving: boolean;
}

interface WizardBasicsActions {
  onFieldChange: (field: keyof WizardFormValues, value: string | boolean) => void;
  onSubmit: () => void;
}

interface WizardStepBasicsProps {
  form: WizardFormValues;
  derived: WizardBasicsDerived;
  actions: WizardBasicsActions;
}

export function WizardStepBasics({ form, derived, actions }: WizardStepBasicsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>System Basics</CardTitle>
        <CardDescription>Enter your design system information</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label htmlFor="figma-file-url" className="text-sm font-medium">Figma file URL *</label>
          <Input
            id="figma-file-url"
            value={form.figmaFileUrl}
            onChange={(e) => actions.onFieldChange("figmaFileUrl", e.target.value)}
            placeholder="https://www.figma.com/file/..."
          />
          {derived.figmaFileId && <p className="mt-1 text-xs text-muted-foreground">File key: {derived.figmaFileId}</p>}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="figma-access-token" className="text-sm font-medium">Figma access token</label>
            <div className="mt-1 flex items-start gap-2">
              <Input
                id="figma-access-token"
                value={form.figmaAccessToken}
                onChange={(e) => actions.onFieldChange("figmaAccessToken", e.target.value)}
                placeholder="env:FIGMA_TOKEN"
                className="flex-1"
              />
              <FigmaMcpConnectionTestButton
                figmaUrl={form.figmaFileUrl}
                figmaToken={form.figmaAccessToken}
              />
            </div>
          </div>

          <div>
            <label htmlFor="system-name" className="text-sm font-medium">System name *</label>
            <Input
              id="system-name"
              value={form.systemName}
              onChange={(e) => actions.onFieldChange("systemName", e.target.value)}
              placeholder="e.g., Acme Design System"
              className="mt-1"
            />
            <p className="mt-1 text-xs text-muted-foreground">Generated ID: {derived.generatedSystemId || "—"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.compileVariablesOnCapture}
              onChange={(e) => actions.onFieldChange("compileVariablesOnCapture", e.target.checked)}
            />
            <span className="text-sm">Compile variables on capture</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.makeDefault}
              onChange={(e) => actions.onFieldChange("makeDefault", e.target.checked)}
            />
            <span className="text-sm">Set as default system</span>
          </label>
        </div>

        <Button onClick={actions.onSubmit} disabled={!derived.isFormValid || derived.saving}>
          {derived.saving ? "Creating…" : "Create system"}
        </Button>
      </CardContent>
    </Card>
  );
}
