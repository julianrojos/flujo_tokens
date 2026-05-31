import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ConsumerDetailPage } from "../consumer-detail-page";
import { ConsumerTabByFile } from "../components/consumer-tab-by-file";
import { ConsumersOverviewPage } from "../consumers-overview-page";

describe("consumer pages smoke", () => {
  it("imports the consumer pages without module-level errors", () => {
    assert.equal(typeof ConsumerDetailPage, "function");
    assert.equal(typeof ConsumerTabByFile, "function");
    assert.equal(typeof ConsumersOverviewPage, "function");
  });
});
