import { createRoot } from "react-dom/client";
import { App } from "./App";
import { RuntimeConnection } from "./RuntimeConnection";
import "../../../packages/ui/tokens.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <App connection={<RuntimeConnection />} />,
);
