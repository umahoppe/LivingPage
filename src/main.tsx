import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ResearchProvider } from "./research-context";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ResearchProvider>
      <App />
    </ResearchProvider>
  </StrictMode>,
);
