import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

export interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export const markdownViewerVariants = cva(
  "prose prose-sm max-w-none prose-invert",
  {
    variants: {},
    defaultVariants: {},
  },
);

const MarkdownViewer = React.forwardRef<HTMLDivElement, MarkdownViewerProps>(
  ({ content, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          markdownViewerVariants(),
          "prose-headings:font-titles prose-headings:font-semibold",
          "prose-h1:text-2xl prose-h1:mb-4",
          "prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-3",
          "prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-2",
          "prose-p:text-muted-foreground prose-p:leading-relaxed",
          "prose-a:text-accent prose-a:no-underline hover:prose-a:underline",
          "prose-code:text-foreground prose-code:bg-surface-2 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:font-mono prose-code:text-xs",
          "prose-pre:bg-surface-2 prose-pre:border prose-pre:border-border/70 prose-pre:rounded",
          "prose-code:before:content-none prose-code:after:content-none",
          "prose-ul:list-disc prose-ol:list-decimal",
          "prose-li:text-muted-foreground",
          "prose-blockquote:border-l-accent/50 prose-blockquote:pl-4 prose-blockquote:text-muted-foreground",
          "prose-table:border-collapse prose-table:w-full prose-table:my-4",
          "prose-th:border-b prose-th:border-border prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold",
          "prose-td:border-b prose-td:border-border prose-td:px-3 prose-td:py-2",
          className,
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    );
  },
);
MarkdownViewer.displayName = "MarkdownViewer";

export { MarkdownViewer };
