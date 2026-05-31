import { useEffect, useState } from "react";

import {
  fetchComponentCatalog,
  fetchReportByComponent,
  fetchReportByVariable,
  fetchTokenCatalog,
  listConsumers,
} from "@/lib/api";
import { toApiErrorDisplay } from "@/lib/api-error-ux";
import { buildComponentLookupMap } from "@/lib/component-identity";
import type { ComponentCatalogItem } from "@/types/component-catalog";
import type { DsConsumer, DsSyncRun, ComponentUsageReport, VariableUsageReport } from "@/types/consumers";

import {
  buildTokenLookups,
  type TokenLookupEntry,
} from "../lib/consumer-detail-lookups";

type ConsumerDetailDataResult = {
  consumer: (DsConsumer & { latestSync?: DsSyncRun }) | null;
  components: ComponentUsageReport[];
  variables: VariableUsageReport[];
  lookups: {
    componentSlugByLookup: Record<string, string>;
    tokenByExactLookup: Record<string, TokenLookupEntry>;
    tokenByLookup: Record<string, TokenLookupEntry | null>;
  };
  catalogs: {
    componentCatalogItems: ComponentCatalogItem[];
  };
  loading: boolean;
  error: ReturnType<typeof toApiErrorDisplay> | null;
};

export function useConsumerDetailData(
  consumerName: string | undefined,
  dsFileKey: string | null | undefined,
  dsFileKeyLoading: boolean,
): ConsumerDetailDataResult {
  const [consumer, setConsumer] = useState<(DsConsumer & { latestSync?: DsSyncRun }) | null>(null);
  const [components, setComponents] = useState<ComponentUsageReport[]>([]);
  const [variables, setVariables] = useState<VariableUsageReport[]>([]);
  const [componentSlugByLookup, setComponentSlugByLookup] = useState<Record<string, string>>({});
  const [componentCatalogItems, setComponentCatalogItems] = useState<ComponentCatalogItem[]>([]);
  const [tokenByExactLookup, setTokenByExactLookup] = useState<Record<string, TokenLookupEntry>>({});
  const [tokenByLookup, setTokenByLookup] = useState<Record<string, TokenLookupEntry | null>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReturnType<typeof toApiErrorDisplay> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearLoadedData = () => {
      setConsumer(null);
      setComponents([]);
      setVariables([]);
      setComponentSlugByLookup({});
      setComponentCatalogItems([]);
      setTokenByExactLookup({});
      setTokenByLookup({});
    };

    const loadData = async () => {
      if (!consumerName) {
        clearLoadedData();
        setError(null);
        setLoading(false);
        return;
      }

      if (dsFileKeyLoading) return;

      setLoading(true);
      setError(null);
      clearLoadedData();

      try {
        if (!dsFileKey) {
          if (cancelled) return;
          setError(toApiErrorDisplay(new Error("No figmaFileId found for active system"), {
            fallbackTitle: "Configuration error",
            fallbackMessage: "Set the Figma File ID in Design Systems Admin.",
          }));
          setLoading(false);
          return;
        }

        const consumersResponse = await listConsumers(dsFileKey);
        if (cancelled) return;

        const foundConsumer = consumersResponse.data.find((consumerItem) => consumerItem.consumerName === consumerName);
        if (!foundConsumer) {
          setError(toApiErrorDisplay(new Error("Consumer not found"), {
            fallbackTitle: "Consumer not found",
            fallbackMessage: "No consumer file matches the requested name.",
          }));
          setLoading(false);
          return;
        }
        setConsumer(foundConsumer);

        const [componentsResponse, variablesResponse, componentCatalog, tokenCatalog] = await Promise.all([
          fetchReportByComponent(dsFileKey),
          fetchReportByVariable(dsFileKey),
          fetchComponentCatalog().catch((cause) => {
            console.warn("[consumer-detail] Component registry fetch failed", cause);
            return { components: [] };
          }),
          fetchTokenCatalog().catch((cause) => {
            console.warn("[consumer-detail] Token registry fetch failed", cause);
            return { entries: [] };
          }),
        ]);
        if (cancelled) return;

        setComponents(componentsResponse.data || []);
        setVariables(variablesResponse.data || []);
        setComponentCatalogItems(componentCatalog.components || []);
        setComponentSlugByLookup(buildComponentLookupMap(componentCatalog.components || []));
        const tokenLookup = buildTokenLookups(tokenCatalog.entries || []);
        setTokenByExactLookup(tokenLookup.exact);
        setTokenByLookup(tokenLookup.fallback);
      } catch (cause) {
        if (cancelled) return;
        setError(toApiErrorDisplay(cause, {
          fallbackTitle: "Load consumer failed",
          fallbackMessage: "Unable to load consumer details.",
        }));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [consumerName, dsFileKey, dsFileKeyLoading]);

  return {
    consumer,
    components,
    variables,
    lookups: {
      componentSlugByLookup,
      tokenByExactLookup,
      tokenByLookup,
    },
    catalogs: {
      componentCatalogItems,
    },
    loading,
    error,
  };
}
