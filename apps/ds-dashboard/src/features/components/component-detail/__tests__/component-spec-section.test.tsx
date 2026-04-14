import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ComponentSpecSection } from '../components/component-spec-section';

describe('ComponentSpecSection', () => {
  it('hides Download markdown button when no editorial spec exists', () => {
    const html = renderToStaticMarkup(
      <ComponentSpecSection
        spec={null}
        canOpenDocs={true}
        showDownloadMarkdown={false}
        onDownloadMarkdown={() => {}}
        onOpenEditorial={() => {}}
      />,
    );

    assert.doesNotMatch(html, /Download markdown/);
  });

  it('shows Download markdown button when editorial spec exists', () => {
    const html = renderToStaticMarkup(
      <ComponentSpecSection
        spec={null}
        canOpenDocs={true}
        showDownloadMarkdown={true}
        onDownloadMarkdown={() => {}}
        onOpenEditorial={() => {}}
      />,
    );

    assert.match(html, /Download markdown/);
  });

  it('hides retry download action when markdown download is disabled', () => {
    const html = renderToStaticMarkup(
      <ComponentSpecSection
        spec={null}
        canOpenDocs={true}
        showDownloadMarkdown={false}
        downloadError="network error"
        onDownloadMarkdown={() => {}}
        onOpenEditorial={() => {}}
      />,
    );

    assert.doesNotMatch(html, /Retry download/);
  });
});
