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

/**
 * Parse and render simple markdown
 */
function renderMarkdown(markdown: string): React.ReactNode[] {
    const lines = markdown.split('\n');
    const elements: React.ReactNode[] = [];

    let inCodeBlock = false;
    let codeContent: string[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code block handling
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                // End of code block
                elements.push(
                    <pre key={`code-${key++}`} className="bg-muted p-3 rounded-md overflow-x-auto text-xs font-mono my-2">
                        {codeContent.join('\n')}
                    </pre>
                );
                codeContent = [];
                inCodeBlock = false;
            } else {
                inCodeBlock = true;
            }
            continue;
        }

        if (inCodeBlock) {
            codeContent.push(line);
            continue;
        }

        // Frontmatter handling
        if (line.startsWith('---') && i < 2) {
            continue;
        }

        // Headers
        if (line.startsWith('### ')) {
            elements.push(
                <h4 key={`h4-${key++}`} className="text-base font-semibold mt-4 mb-2">
                    {line.slice(4)}
                </h4>
            );
            continue;
        }
        if (line.startsWith('## ')) {
            elements.push(
                <h3 key={`h3-${key++}`} className="text-lg font-semibold mt-4 mb-2">
                    {line.slice(3)}
                </h3>
            );
            continue;
        }
        if (line.startsWith('# ')) {
            elements.push(
                <h2 key={`h2-${key++}`} className="text-xl font-bold mt-4 mb-2">
                    {line.slice(2)}
                </h2>
            );
            continue;
        }

        // List items
        if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(
                <li key={`li-${key++}`} className="ml-4 list-disc">
                    {renderInlineContent(line.slice(2))}
                </li>
            );
            continue;
        }

        // Numbered list
        if (/^\d+\.\s/.test(line)) {
            const match = line.match(/^(\d+)\.\s(.*)$/);
            if (match) {
                elements.push(
                    <li key={`li-${key++}`} className="ml-4 list-decimal">
                        {renderInlineContent(match[2])}
                    </li>
                );
            }
            continue;
        }

        // Empty lines
        if (line.trim() === '') {
            continue;
        }

        // Regular paragraph
        elements.push(
            <p key={`p-${key++}`} className="my-2">
                {renderInlineContent(line)}
            </p>
        );
    }

    return elements;
}

/**
 * Render inline content with basic formatting
 */
function renderInlineContent(text: string): React.ReactNode {
    // Handle bold
    const boldParts = text.split(/(\*\*[^*]+\*\*)/);
    return boldParts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        // Handle inline code
        const codeParts = part.split(/(`[^`]+`)/);
        return codeParts.map((cp, j) => {
            if (cp.startsWith('`') && cp.endsWith('`')) {
                return <code key={`${i}-${j}`} className="bg-muted px-1 rounded text-xs">{cp.slice(1, -1)}</code>;
            }
            return cp;
        });
    });
}

export function AiDocPreview({ markdown, className }: AiDocPreviewProps) {
    if (!markdown) {
        return (
            <div className="text-muted-foreground text-sm p-4">
                No documentation generated yet.
            </div>
        );
    }

    return (
        <div className={`prose prose-sm max-w-none ${className}`}>
            {renderMarkdown(markdown)}
        </div>
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
