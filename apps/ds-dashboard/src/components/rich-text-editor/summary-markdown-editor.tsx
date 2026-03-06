import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Heading from "@tiptap/extension-heading";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import Blockquote from "@tiptap/extension-blockquote";
import Code from "@tiptap/extension-code";
import ListItem from "@tiptap/extension-list-item";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";

import { SummaryMarkdownToolbar } from "./summary-markdown-toolbar";

interface SummaryMarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
}

export function SummaryMarkdownEditor({
  value,
  onChange,
  placeholder = "Enter markdown content...",
}: SummaryMarkdownEditorProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);

  const editor = useEditor(
    {
      extensions: [
        Document,
        Paragraph,
        Text,
        Bold,
        Italic,
        Strike,
        Heading.configure({
          levels: [2, 3],
        }),
        BulletList,
        OrderedList,
        Blockquote,
        Code,
        ListItem,
        Placeholder.configure({
          placeholder,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer",
          },
        }),
        Markdown.configure({
          html: false,
          linkify: false,
          breaks: false,
        }),
      ],
      content: value,
      editorProps: {
        attributes: {
          class:
            "prose prose-sm max-w-none dark:prose-invert min-h-[80px] rounded-md border border-border bg-background p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
        },
      },
      onUpdate: ({ editor }) => {
        const markdown = (editor.storage as { markdown?: { getMarkdown: () => string } }).markdown?.getMarkdown() ?? "";
        onChange(markdown);
      },
      immediatelyRender: false,
    },
    [],
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync external value changes only on mount or when editor is not focused
  // This prevents cursor jumps while user is actively editing
  useEffect(() => {
    if (!editor || !isMounted) return;

    const isFocused = editor.isFocused;
    if (isFocused) return;

    const storage = editor.storage as { markdown?: { getMarkdown: () => string } };
    const currentMarkdown = storage.markdown?.getMarkdown() ?? "";
    
    // Only update if the value differs significantly (not just whitespace)
    if (currentMarkdown.trim() !== value.trim()) {
      editor.commands.setContent(value);
    }
  }, [editor, value, isMounted]);

  if (!editor || !isMounted) {
    return (
      <div className="min-h-[80px] animate-pulse rounded-md border border-border bg-muted/30" />
    );
  }

  return (
    <div className="relative">
      <BubbleMenu
        editor={editor}
        updateDelay={100}
        shouldShow={() => {
          // Keep menu visible when link popover is open to prevent focus loss
          if (linkPopoverOpen) return true;
          // Default behavior: show when there's a selection or cursor in a link
          const { state } = editor.view;
          return state.selection.content().size > 0 || editor.isActive("link");
        }}
      >
        <SummaryMarkdownToolbar editor={editor} onLinkPopoverOpen={setLinkPopoverOpen} />
      </BubbleMenu>
      <EditorContent editor={editor} />
    </div>
  );
}
