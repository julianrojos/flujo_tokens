import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StatsOverview } from "../stats-overview";

describe("StatsOverview", () => {
  it("renders optional descriptions as screen-reader-only text", () => {
    const html = renderToStaticMarkup(
      <StatsOverview
        items={[
          {
            id: "ds-components",
            label: "DS components",
            value: 12,
          },
          {
            id: "non-ds-components",
            label: "Non-DS components",
            value: 3,
            description: "Includes local and other-library components not matched to the tracked DS during the last sync",
          },
        ]}
      />,
    );

    assert.match(html, /DS components/);
    assert.match(html, /Non-DS components/);
    assert.match(html, /Includes local and other-library components not matched to the tracked DS during the last sync/);
    assert.doesNotMatch(html, /title="Includes local and other-library components not matched to the tracked DS during the last sync"/);
  });
});
