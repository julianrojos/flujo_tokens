/**
 * Token Detail Page - orchestrator only.
 * Delegates all logic to useTokenDetail hook and section components.
 */

import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { StatusAlert } from "@/components/ui/status-alert";
import { PageHeader, PrevNextNav } from "@/components/composites";
import { useTokenDetail } from "./hooks/use-token-detail";
import { TokenIdentitySection } from "./components/token-identity-section";
import { TokenAliasSection } from "./components/token-alias-section";
import { TokenRelationsSection } from "./components/token-relations-section";
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

      <PrevNextNav
        hasPrevious={Boolean(previousToken)}
        hasNext={Boolean(nextToken)}
        onPrevious={() => handleNavigate(previousToken!)}
        onNext={() => handleNavigate(nextToken!)}
        currentIndex={currentTokenIndex}
        totalItems={scopedTokens.length}
      />

      <TokenIdentitySection
        token={token}
        swatch={swatch}
        dimensionPreview={dimensionPreview}
        onCopyField={handleCopyValue}
        copiedField={copiedField}
      />

      <TokenRelationsSection
        tokenPath={token.path}
        aliasOf={token.aliasOf ?? null}
        hasDescendantAliases={aliasDescendantChains.size > 0}
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
        filteredComponentUsages={filteredComponentUsages}
        componentUsageSummary={componentUsageSummary}
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
