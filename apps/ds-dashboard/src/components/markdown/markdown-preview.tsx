import { MarkdownViewer } from "@/components/ui/markdown-viewer";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  const normalizedContent = content.trim();
  return <MarkdownViewer content={normalizedContent || "No content."} />;
}
