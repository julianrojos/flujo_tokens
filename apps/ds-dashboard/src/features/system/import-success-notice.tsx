import React from "react";
import { StatusAlert } from "@/components/ui/status-alert";

import {
  formatImportSuccessNotice,
  type ImportSuccessSummary,
} from "./new-system-import-summary";

export function ImportSuccessNotice({ summary }: { summary: ImportSuccessSummary }) {
  const notice = formatImportSuccessNotice(summary);
  const details = [
    notice.elementsLine,
    notice.collectionsLine,
    notice.variablesLine,
    notice.customPropertiesLine,
  ];
  return (
    <StatusAlert
      variant="success"
      title="Design system successfully imported."
      description={
        <>
          {details.map((line, index) => (
            <p key={index} className="mt-1">
              {line}
            </p>
          ))}
        </>
      }
    />
  );
}
