import React from "react";
import { StatusAlert } from "@/components/ui/status-alert";

import {
  formatImportSuccessNotice,
  type ImportSuccessSummary,
} from "./new-system-import-summary";

export function ImportSuccessNotice({ summary }: { summary: ImportSuccessSummary }) {
  const notice = formatImportSuccessNotice(summary);
  return (
    <StatusAlert
      variant="success"
      title="Design system successfully imported."
      description={
        <>
          <p className="mt-1">{notice.elementsLine}</p>
          <p className="mt-1">{notice.collectionsLine}</p>
          <p className="mt-1">{notice.variablesLine}</p>
          <p className="mt-1">{notice.customPropertiesLine}</p>
        </>
      }
    />
  );
}
