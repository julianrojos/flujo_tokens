import React from "react";
import { useDesignSystem } from "@/lib/design-system-context";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem, setActiveSystem } = useDesignSystem();
  
  const currentSys = systems.find((s) => s.id === activeSystem);
  
  return (
    <div className={cn("mt-2 flex flex-col gap-2", collapsed && "sr-only")}>
      <h1 className="text-2xl font-semibold tracking-tight">
        Flujo Tokens
      </h1>
      
      <div className="mt-1">
        <Select
          value={activeSystem}
          onChange={(e) => setActiveSystem(e.target.value)}
          className="w-full text-sm font-medium h-9"
        >
          {systems.length === 0 ? (
            <option value="">Loading...</option>
          ) : (
            systems.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.name}
              </option>
            ))
          )}
        </Select>
      </div>
    </div>
  );
}
