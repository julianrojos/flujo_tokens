import React from "react";
import { useDesignSystem } from "@/lib/design-system-context";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function SystemSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { systems, activeSystem, setActiveSystem } = useDesignSystem();
  
  const currentSys = systems.find((s) => s.id === activeSystem);
  
  if (systems.length <= 1) {
    return (
      <div className={cn("mt-2", collapsed && "sr-only")}>
        <h1 className="text-2xl font-semibold tracking-tight">
          {currentSys?.name || "Design System"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {currentSys?.name ? `${currentSys.name} Documentation` : "Local configuration loaded."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("mt-2 flex flex-col gap-2", collapsed && "sr-only")}>
      <Select
        value={activeSystem}
        onChange={(e) => setActiveSystem(e.target.value)}
        className="w-full text-lg font-semibold py-2 h-auto"
      >
        {systems.map((sys) => (
          <option key={sys.id} value={sys.id}>
            {sys.name}
          </option>
        ))}
      </Select>
      <p className="text-sm text-muted-foreground">
        Local Multi-System Workspace
      </p>
    </div>
  );
}
