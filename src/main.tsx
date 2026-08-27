import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/engine";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

/* Enregistrement PWA : service worker, hors-ligne, push. */
registerServiceWorker();
