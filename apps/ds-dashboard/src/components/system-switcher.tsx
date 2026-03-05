import React from "react";
import { useNavigate } from "react-router-dom";
import { useDesignSystem } from "@/lib/design-system-context";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem, setActiveSystem } = useDesignSystem();
  const navigate = useNavigate();
  const hasSystems = systems.length > 0;
  const selectValue = hasSystems ? activeSystem : "new-system";
  
  const handleSystemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === "new-system") {
      navigate("/system/new");
      // Keep current system selected when available.
      if (hasSystems) e.target.value = activeSystem;
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
          value={selectValue}
          onChange={handleSystemChange}
          className="w-full text-sm font-medium h-9"
        >
          {!hasSystems ? (
            <option value="new-system">+ Add New Design System</option>
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
