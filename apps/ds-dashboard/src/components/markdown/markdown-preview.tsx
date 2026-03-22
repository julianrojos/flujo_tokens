import { MarkdownViewer } from "@/components/ui/markdown-viewer";

interface MarkdownPreviewProps {
  content: string;
}

export function MarkdownPreview({ content }: MarkdownPreviewProps) {
  return <MarkdownViewer content={content || "No content."} />;
}
