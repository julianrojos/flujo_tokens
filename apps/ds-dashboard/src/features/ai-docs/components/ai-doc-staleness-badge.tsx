/**
 * AiDocStalenessBadge Component
 * Badge showing documentation staleness status
 */

import { Badge } from '@/components/ui/badge';
import type { DocStatus } from '@/types/ai-jobs';

interface AiDocStalenessBadgeProps {
    status: DocStatus;
    className?: string;
}

const STATUS_CONFIG: Record<DocStatus, { variant: 'success' | 'warning' | 'neutral'; label: string }> = {
    fresh: { variant: 'success', label: 'Fresh' },
    stale: { variant: 'warning', label: 'Stale' },
    missing: { variant: 'neutral', label: 'Missing' },
};

export function AiDocStalenessBadge({ status, className }: AiDocStalenessBadgeProps) {
    const config = STATUS_CONFIG[status];

    return (
        <Badge variant={config.variant} className={className}>
            {config.label}
        </Badge>
    );
}
