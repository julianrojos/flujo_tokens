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
import { TokenUsageInTokensSection } from "./components/token-usage-in-tokens-section";
import { TokenUsageSection } from "./components/token-usage-section";

function decodeSafe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function TokenDetailPage() {
  const { tokenPath } = useParams<{ tokenPath: string }>();
  const navigate = useNavigate();
  const displayTokenPath = decodeSafe(String(tokenPath || "").trim()).replace(/\./g, "/");
  const {
    loading,
    error,
    token,
    swatch,
    dimensionPreview,
    displayType,
    tokenAliasChain,
    aliasFinal,
    aliasConsumers,
    filteredComponentUsages,
    componentUsageSummary,
    scopedTokens,
    currentTokenIndex,
    previousToken,
    nextToken,
    tokenUsageInTokensRows,
    componentMode,
    componentQuery,
    setComponentFilter,
    handleNavigate,
  } = useTokenDetail(tokenPath);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Loading…" />
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="space-y-5">
        <PageHeader title="Token not found" />
        <StatusAlert variant="error" description={error || `Token "${displayTokenPath}" not found in registry.`} />
        <Button variant="outline" onClick={() => navigate("/tokens")}>← Back to tokens</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={token.slashPath} />

      <PrevNextNav
        hasPrevious={Boolean(previousToken)}
        hasNext={Boolean(nextToken)}
        onPrevious={() => handleNavigate(previousToken!)}
        onNext={() => handleNavigate(nextToken!)}
        onFirst={scopedTokens[0] ? () => handleNavigate(scopedTokens[0]) : undefined}
        onLast={scopedTokens[scopedTokens.length - 1] ? () => handleNavigate(scopedTokens[scopedTokens.length - 1]) : undefined}
        currentIndex={currentTokenIndex}
        totalItems={scopedTokens.length}
      />

      <TokenIdentitySection
        token={token}
        displayType={displayType}
        tokenAliasChain={tokenAliasChain}
        aliasFinal={aliasFinal}
        aliasConsumers={aliasConsumers}
        swatch={swatch}
        dimensionPreview={dimensionPreview}
      />

      <TokenUsageInTokensSection rows={tokenUsageInTokensRows} />

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
