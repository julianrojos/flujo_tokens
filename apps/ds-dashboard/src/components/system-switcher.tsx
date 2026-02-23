import React from "react";
import { useDesignSystem } from "@/lib/design-system-context";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem, setActiveSystem } = useDesignSystem();
  
  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "new-system") {
      alert("Para añadir un nuevo sistema, edita el archivo tooling/config/design-systems.json o utiliza la página de Operaciones.");
      // Reset the select back to the active system
      e.target.value = activeSystem;
      return;
    }
    setActiveSystem(value);
  };
  
  return (
    <div className={cn("mt-2 flex flex-col gap-2", collapsed && "sr-only")}>
      <h1 className="text-2xl font-semibold tracking-tight">
        Flujo Tokens
      </h1>
      
      <div className="mt-1">
        <Select
          value={activeSystem}
          onChange={handleSystemChange}
          className="w-full text-sm font-medium h-9"
        >
          {systems.length === 0 ? (
            <option value="">Loading...</option>
          ) : (
            <>
              {systems.map((sys) => (
                <option key={sys.id} value={sys.id}>
                  {sys.name}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value="new-system">+ Add new system...</option>
            </>
          )}
        </Select>
      </div>
    </div>
  );
}
