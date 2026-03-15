import "reflect-metadata";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HostedCodemationApp } from "@codemation/frontend/client";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("The app root element could not be found.");
}

createRoot(rootElement).render(
  <StrictMode>
    <HostedCodemationApp />
  </StrictMode>,
);
