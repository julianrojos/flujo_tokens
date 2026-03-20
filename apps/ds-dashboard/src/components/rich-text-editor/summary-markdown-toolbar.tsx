import type { Editor } from "@tiptap/react";
import { useState, useEffect } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Quote, Code, Link2, Heading2, Heading3, X, Check } from "lucide-react";

import { Button } from "@/components/ui/button";

interface SummaryMarkdownToolbarProps {
  editor: Editor;
  onLinkPopoverOpen?: (open: boolean) => void;
}

export function SummaryMarkdownToolbar({ editor, onLinkPopoverOpen }: SummaryMarkdownToolbarProps) {
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    onLinkPopoverOpen?.(linkInputOpen);
  }, [linkInputOpen, onLinkPopoverOpen]);

  const applyLink = () => {
    if (!linkUrl.trim()) {
      editor.chain().focus().unsetLink().run();
      setLinkInputOpen(false);
      setLinkUrl("");
      setLinkError(null);
      return;
    }

    // Simple validation: must start with allowed protocol or be a relative path
    const trimmed = linkUrl.trim();
    const hasAllowedProtocol = /^(https?:|mailto:)/i.test(trimmed);
    const isRelativePath = trimmed.startsWith("/") || trimmed.startsWith("#") || trimmed.startsWith("?");

    if (!hasAllowedProtocol && !isRelativePath) {
      setLinkError("Invalid URL. Use http://, https://, mailto:, or a relative path (/..., #..., ?...).");
      return;
    }

    setLinkError(null);
    editor.chain().focus().setLink({ href: trimmed }).run();
    setLinkInputOpen(false);
    setLinkUrl("");
  };

  const handleLinkClick = () => {
    const currentUrl = editor.getAttributes("link").href;
    setLinkUrl(currentUrl || "");
    setLinkInputOpen(true);
    setLinkError(null);
  };

  const closeLinkInput = () => {
    setLinkInputOpen(false);
    setLinkUrl("");
    setLinkError(null);
  };

  return (
    <div className="flex items-center gap-1 rounded-md border border-border bg-background p-1 shadow-lg">
      <Button
        type="button"
        variant={editor.isActive("bold") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleBold().run()}

        aria-label="Toggle bold"
      >
        <Bold className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("italic") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleItalic().run()}

        aria-label="Toggle italic"
      >
        <Italic className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("strike") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleStrike().run()}

        aria-label="Toggle strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        type="button"
        variant={editor.isActive("heading", { level: 2 }) ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}

        aria-label="Toggle heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("heading", { level: 3 }) ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}

        aria-label="Toggle heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />

      <Button
        type="button"
        variant={editor.isActive("bulletList") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleBulletList().run()}

        aria-label="Toggle bullet list"
      >
        <List className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("orderedList") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}

        aria-label="Toggle ordered list"
      >
        <ListOrdered className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("blockquote") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}

        aria-label="Toggle blockquote"
      >
        <Quote className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("code") ? "outline" : "ghost"}
        size="sm"
        onClick={() => editor.chain().focus().toggleCode().run()}

        aria-label="Toggle inline code"
      >
        <Code className="h-4 w-4" />
      </Button>

      <Button
        type="button"
        variant={editor.isActive("link") ? "outline" : "ghost"}
        size="sm"
        onClick={handleLinkClick}
        aria-label={editor.isActive("link") ? "Edit link" : "Add link"}
      >
        <Link2 className="h-4 w-4" />
      </Button>

      {linkInputOpen && (
        <div className="flex flex-col gap-1 rounded-md border border-border bg-background px-2 py-1">
          <input
            type="text"
            value={linkUrl}
            onChange={(e) => {
              setLinkUrl(e.target.value);
              if (linkError) setLinkError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                closeLinkInput();
              }
            }}
            placeholder="Enter URL or relative path..."
            className="w-48 rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          {linkError && (
            <p className="text-xs text-status-error">{linkError}</p>
          )}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={applyLink}
              aria-label="Apply link"
            >
              <Check className="h-3 w-3" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={closeLinkInput}
              aria-label="Cancel link"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
