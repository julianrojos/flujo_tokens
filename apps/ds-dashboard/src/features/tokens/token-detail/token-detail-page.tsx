/**
 * Token Detail Page - orchestrator only.
 * Delegates all logic to useTokenDetail hook and section components.
 */

import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { PageHeader } from "@/components/composites";
import { useTokenDetail } from "./hooks/use-token-detail";
import { TokenIdentitySection } from "./components/token-identity-section";
import { TokenAliasSection } from "./components/token-alias-section";
import { TokenUsageSection } from "./components/token-usage-section";
import { TokenHealthSection } from "./components/token-health-section";

export function TokenDetailPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const navigate = useNavigate();
  const {
    loading,
    error,
    token,
    swatch,
    dimensionPreview,
    tokenAliasChain,
    aliasFinal,
    aliasDescendantChains,
    filteredComponentUsages,
    componentUsageSummary,
    occurrencesByKind,
    healthIssues,
    scopedTokens,
    currentTokenIndex,
    previousToken,
    nextToken,
    componentMode,
    componentQuery,
    copiedField,
    handleCopyValue,
    setComponentFilter,
    handleNavigate,
  } = useTokenDetail(tokenPath);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading…" description="Loading token details" />
        <div className="space-y-4">
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
          <div className="h-48 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="space-y-5">
        <PageHeader title="Token not found" description={tokenPath} />
        <StatusAlert variant="error" description={error || `Token "${tokenPath}" not found in registry.`} />
        <Button variant="outline" onClick={() => navigate("/tokens")}>← Back to tokens</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={token.path}
        description={`${token.collection} · ${token.type}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        {previousToken && (
          <Button variant="outline" size="sm" onClick={() => handleNavigate(previousToken)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Prev
          </Button>
        )}
        {nextToken && (
          <Button variant="outline" size="sm" onClick={() => handleNavigate(nextToken)}>
            Next → <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
        {scopedTokens.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {currentTokenIndex + 1} / {scopedTokens.length}
          </span>
        )}
      </div>

      <TokenIdentitySection
        token={token}
        swatch={swatch}
        dimensionPreview={dimensionPreview}
        onCopyField={handleCopyValue}
        copiedField={copiedField}
        onNavigate={handleNavigate}
        previousToken={previousToken}
        nextToken={nextToken}
        currentTokenIndex={currentTokenIndex}
        scopedTokens={scopedTokens}
      />

      {tokenAliasChain.length > 0 && (
        <TokenAliasSection
          token={token}
          tokenAliasChain={tokenAliasChain}
          aliasFinal={aliasFinal}
          aliasDescendantChains={aliasDescendantChains}
          onCopyField={handleCopyValue}
          copiedField={copiedField}
        />
      )}

      <TokenUsageSection
        token={token}
        filteredComponentUsages={filteredComponentUsages}
        componentUsageSummary={componentUsageSummary}
        occurrencesByKind={occurrencesByKind}
        filters={{
          componentMode,
          componentQuery,
        }}
        actions={{
          setComponentFilter,
        }}
      />

      <TokenHealthSection healthIssues={healthIssues} />
    </div>
  );
}
