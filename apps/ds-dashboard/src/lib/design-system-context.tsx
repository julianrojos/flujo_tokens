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
        const initialSystem = stored || config.defaultSystem;
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
