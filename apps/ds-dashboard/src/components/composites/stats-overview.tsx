import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardDescription, CardTitle } from "@/components/ui/card";

export interface StatsOverviewItem {
  id: string;
  label: string;
  value: ReactNode;
  description?: string;
  to?: string;
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
        item.to ? (
          <Link
            key={item.id}
            to={item.to}
            className="group block h-full text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-primary/5">
              <CardHeader>
                <CardDescription className="transition-colors group-hover:text-primary">{item.label}</CardDescription>
                <CardTitle className="group-hover:text-primary">{item.value}</CardTitle>
                {item.description ? <p className="sr-only">{item.description}</p> : null}
              </CardHeader>
            </Card>
          </Link>
        ) : (
          <Card key={item.id}>
            <CardHeader>
              <CardDescription>{item.label}</CardDescription>
              <CardTitle>{item.value}</CardTitle>
              {item.description ? <p className="sr-only">{item.description}</p> : null}
            </CardHeader>
          </Card>
        )
      ))}
    </section>
  );
}
