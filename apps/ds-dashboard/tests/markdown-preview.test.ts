import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { MarkdownPreview } from "../src/components/markdown/markdown-preview.js";

describe("MarkdownPreview", () => {
  const render = (content: string) => {
    const element = createElement(MarkdownPreview, { content });
    return renderToStaticMarkup(element);
  };

  it("renders empty content with fallback message", () => {
    const html = render("");
    assert.match(html, /No content/);
  });

  it("renders heading", () => {
    const html = render("# Hello World");
    assert.match(html, /<h1>Hello World<\/h1>/);
  });

  it("renders bold text", () => {
    const html = render("**bold**");
    assert.match(html, /<strong>bold<\/strong>/);
  });

  it("renders italic text", () => {
    const html = render("*italic*");
    assert.match(html, /<em>italic<\/em>/);
  });

  it("renders lists", () => {
    const html = render("- Item 1\n- Item 2");
    assert.match(html, /<ul>/);
    assert.match(html, /<li>Item 1<\/li>/);
    assert.match(html, /<li>Item 2<\/li>/);
  });

  it("renders GFM tables", () => {
    const markdown = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
`.trim();
    const html = render(markdown);
    assert.match(html, /<table>/);
    assert.match(html, /<th>Header 1<\/th>/);
    assert.match(html, /<td>Cell 1<\/td>/);
  });

  it("renders code blocks", () => {
    const markdown = "```ts\nconst x = 1;\n```";
    const html = render(markdown);
    assert.match(html, /<pre>/);
    assert.match(html, /<code[^>]*>/);
    assert.match(html, /const x = 1/);
  });

  it("renders links", () => {
    const html = render("[link](https://example.com)");
    assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/);
  });

  it("renders blockquotes", () => {
    const html = render("> quote");
    assert.match(html, /<blockquote>/);
    assert.match(html, /<p>quote<\/p>/);
  });
});
