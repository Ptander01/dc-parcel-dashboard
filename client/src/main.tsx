// Vercel Web Analytics. Patches history.pushState, so client-side
// navigation is reported without any per-route wiring.
inject()

import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { inject } from '@vercel/analytics'

createRoot(document.getElementById("root")!).render(<App />);
