import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./globals.css";
import "./chat.css";
import "@copilotkit/react-core/v2/styles.css";
import { Providers } from "./providers";
import App from "./app";

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><Providers><App /></Providers></StrictMode>);
