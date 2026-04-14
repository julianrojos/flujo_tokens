import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";

export interface StatsOverviewItem {
  id: string;
  label: string;
  value: ReactNode;
}

export interface StatsOverviewProps {
  items: StatsOverviewItem[];
  className?: string;
  gridClassName?: string;
}

export function StatsOverview({ items, className, gridClassName }: StatsOverviewProps) {
  const defaultColumnsClass =
    items.length <= 1
      ? "md:grid-cols-1"
      : items.length === 2
        ? "md:grid-cols-2"
        : items.length === 3
          ? "md:grid-cols-3"
          : "md:grid-cols-4";

  return (
    <section className={cn("grid gap-4", defaultColumnsClass, gridClassName, className)}>
      {items.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle>{item.value}</CardTitle>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}
