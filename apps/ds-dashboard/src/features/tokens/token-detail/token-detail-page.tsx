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
import { TokenRelationsSection } from "./components/token-relations-section";
import { TokenUsageSection } from "./components/token-usage-section";

export function TokenDetailPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const navigate = useNavigate();
  const {
    loading,
    error,
    token,
    swatch,
    dimensionPreview,
    displayType,
    tokenAliasChain,
    aliasFinal,
    aliasDescendantChains,
    filteredComponentUsages,
    componentUsageSummary,
    scopedTokens,
    currentTokenIndex,
    previousToken,
    nextToken,
    componentMode,
    componentQuery,
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
        description={`${token.collection} · ${displayType}`}
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
        displayType={displayType}
        tokenAliasChain={tokenAliasChain}
        aliasFinal={aliasFinal}
        swatch={swatch}
        dimensionPreview={dimensionPreview}
      />

      <TokenRelationsSection
        tokenPath={token.path}
        aliasOf={token.aliasOf ?? null}
        hasDescendantAliases={aliasDescendantChains.size > 0}
      />

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

    </div>
  );
}
