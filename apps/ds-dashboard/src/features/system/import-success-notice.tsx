import React from "react";

import {
  formatImportSuccessNotice,
  type ImportSuccessSummary,
} from "./new-system-import-summary";

export function ImportSuccessNotice({ summary }: { summary: ImportSuccessSummary }) {
  const notice = formatImportSuccessNotice(summary);
  return (
    <div className="mt-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
      <p>{notice.elementsLine}</p>
      <p className="mt-1">{notice.variablesLine}</p>
    </div>
  );
}
