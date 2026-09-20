import { createRoot } from "react-dom/client";
import {desktop, useDownloads} from "./desktop";
import { App } from "./App";
import { RuntimeConnection } from "./RuntimeConnection";
import "../../../packages/ui/tokens.css";
import "./style.css";
function DesktopApp() { const {rows,error} = useDownloads(); return <App rows={rows} backend={desktop} connection={<><RuntimeConnection />{error && <p role="alert">{error}</p>}</>} />; }
createRoot(document.getElementById("root")!).render(<DesktopApp />);
