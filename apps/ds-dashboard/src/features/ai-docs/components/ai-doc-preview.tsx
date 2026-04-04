import { MarkdownViewer } from "@/components/ui/markdown-viewer";

/**
 * AiDocPreview Component
 * Simple markdown preview for generated documentation
 */

interface AiDocPreviewProps {
    /** Markdown content to preview */
    markdown: string;
    /** Optional className for styling */
    className?: string;
}

/**
 * Format a timestamp to a relative time string
 */
function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    return `${hours}h ago`;
}

export function AiDocPreview({ markdown, className }: AiDocPreviewProps) {
    if (!markdown) {
        return (
            <div className="text-muted-foreground text-sm p-4">
                No documentation generated yet.
            </div>
        );
    }

    const markdownWithoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n?/, '');

    return (
        <MarkdownViewer content={markdownWithoutFrontmatter} className={className} />
    );
}

/**
 * Format job event for display
 */
export function formatJobEvent(event: { event: string; ts: number; data?: unknown }): string {
    // Convert event name to readable format
    const eventName = event.event
        .replace(/[._]/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .trim();

    // Add data context if available
    if (event.data) {
        const dataStr = typeof event.data === 'string' ? event.data : JSON.stringify(event.data);
        return `${eventName}: ${dataStr}`;
    }

    return eventName;
}

/**
 * Format timestamp for display
 */
export { formatRelativeTime };
