import React, { createContext, useContext, useEffect, useState } from "react";
import { fetchDesignSystemsConfig, setActiveSystemId } from "./api";
import { type ApiErrorDisplay, toApiErrorDisplay } from "./api-error-ux";
import { ApiErrorMessage } from "@/components/api-error-message";

export interface DesignSystem {
  id: string;
  name: string;
  figmaFileId?: string;
}

export interface DesignSystemsConfig {
  systems: DesignSystem[];
  defaultSystem: string;
}

interface DesignSystemContextValue {
  systems: DesignSystem[];
  activeSystem: string;
  setActiveSystem: (id: string) => void;
  addSystem: (system: DesignSystem, options?: { makeDefault?: boolean }) => void;
  replaceSystems: (systems: DesignSystem[], options?: { activeSystemId?: string }) => void;
  isLoading: boolean;
  error: ApiErrorDisplay | null;
}

const DesignSystemContext = createContext<DesignSystemContextValue | null>(null);

export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  const [systems, setSystems] = useState<DesignSystem[]>([]);
  const [activeSystem, setActiveSystemState] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiErrorDisplay | null>(null);

  useEffect(() => {
    async function loadSystems() {
      try {
        const config = await fetchDesignSystemsConfig();
        
        setSystems(config.systems || []);
        
        const stored = localStorage.getItem("ds-system-id");
        const validStored = stored && (config.systems || []).some(
          (s: { id: string }) => s.id === stored,
        );
        const initialSystem = validStored ? stored : config.defaultSystem;
        setActiveSystemState(initialSystem);
        setActiveSystemId(initialSystem);
      } catch (err) {
        setError(
          toApiErrorDisplay(err, {
            fallbackTitle: "Design systems unavailable",
            fallbackMessage: "Unable to load design systems configuration.",
          }),
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadSystems();
  }, []);

  const handleSetActiveSystem = (id: string) => {
    setActiveSystemState(id);
    setActiveSystemId(id);
  };

  const handleAddSystem = (system: DesignSystem, options?: { makeDefault?: boolean }) => {
    setSystems((prev) => {
      if (prev.some((item) => item.id === system.id)) return prev;
      return [...prev, system];
    });
    if (options?.makeDefault) {
      setActiveSystemState(system.id);
      setActiveSystemId(system.id);
    }
  };

  const handleReplaceSystems = (
    nextSystems: DesignSystem[],
    options?: { activeSystemId?: string },
  ) => {
    setSystems(nextSystems);
    if (typeof options?.activeSystemId === "string") {
      setActiveSystemState(options.activeSystemId);
      setActiveSystemId(options.activeSystemId);
      return;
    }
    if (nextSystems.length === 0) {
      setActiveSystemState("");
      setActiveSystemId("");
      return;
    }
    const hasCurrent = nextSystems.some((item) => item.id === activeSystem);
    if (!hasCurrent && nextSystems.length > 0) {
      const fallback = nextSystems[0].id;
      setActiveSystemState(fallback);
      setActiveSystemId(fallback);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-neutral-400">Loading design systems...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <ApiErrorMessage error={error} />
      </div>
    );
  }

  return (
    <DesignSystemContext.Provider
      value={{
        systems,
        activeSystem,
        setActiveSystem: handleSetActiveSystem,
        addSystem: handleAddSystem,
        replaceSystems: handleReplaceSystems,
        isLoading,
        error,
      }}
    >
      <React.Fragment key={activeSystem}>
        {children}
      </React.Fragment>
    </DesignSystemContext.Provider>
  );
}

export function useDesignSystem() {
  const ctx = useContext(DesignSystemContext);
  if (!ctx) {
    throw new Error("useDesignSystem must be used within DesignSystemProvider");
  }
  return ctx;
}
