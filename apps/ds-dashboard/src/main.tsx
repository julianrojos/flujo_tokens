import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

import App from "./App";
import "./index.css";
import { DesignSystemProvider } from "./lib/design-system-context";
import { FigmaMcpStatusProvider } from "./lib/figma-mcp-status-context";
import { queryClient } from "./lib/query-client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <DesignSystemProvider>
          <FigmaMcpStatusProvider>
            <App />
          </FigmaMcpStatusProvider>
        </DesignSystemProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
