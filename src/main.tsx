import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallback={<div className="error-boundary">应用遇到了问题，请刷新页面重试</div>}>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
