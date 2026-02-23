import React, { createContext, useContext, useEffect, useState } from "react";
import { setActiveSystemId } from "./api";

export interface DesignSystem {
  id: string;
  name: string;
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
  error: Error | null;
}

const DesignSystemContext = createContext<DesignSystemContextValue | null>(null);

export function DesignSystemProvider({ children }: { children: React.ReactNode }) {
  const [systems, setSystems] = useState<DesignSystem[]>([]);
  const [activeSystem, setActiveSystemState] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function loadSystems() {
      try {
        const res = await fetch("/api/design-systems");
        if (!res.ok) throw new Error("Failed to load design systems");
        const config = (await res.json()) as DesignSystemsConfig;
        
        setSystems(config.systems || []);
        
        const stored = localStorage.getItem("ds-system-id");
        const validStored = stored && (config.systems || []).some(
          (s: { id: string }) => s.id === stored,
        );
        const initialSystem = validStored ? stored : config.defaultSystem;
        setActiveSystemState(initialSystem);
        setActiveSystemId(initialSystem);
      } catch (err: any) {
        setError(err);
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
    if (options?.activeSystemId) {
      setActiveSystemState(options.activeSystemId);
      setActiveSystemId(options.activeSystemId);
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
    return <div className="p-8 text-red-500">Error loading design systems: {error.message}</div>;
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
