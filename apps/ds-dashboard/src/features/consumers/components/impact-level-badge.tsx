import { Badge } from "@/components/ui/badge";
import type { ImpactLevel } from "@/types/consumers";

interface ImpactLevelBadgeProps {
  level: ImpactLevel;
  className?: string;
}

const variantMap: Record<ImpactLevel, 'error' | 'warning' | 'default' | 'neutral'> = {
  CRITICAL: 'error',
  HIGH: 'warning',
  MEDIUM: 'default',
  LOW: 'neutral',
};

const labelMap: Record<ImpactLevel, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export function ImpactLevelBadge({ level, className }: ImpactLevelBadgeProps) {
  return (
    <Badge variant={variantMap[level]} className={className}>
      {labelMap[level]}
    </Badge>
  );
}
