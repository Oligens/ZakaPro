import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { registerServiceWorker } from "./lib/engine";

/**
 * Signature développeur — console uniquement.
 * Aucun élément DOM n'est créé : la signature reste totalement invisible
 * dans le hub et dans toutes les pages/composants de l'application.
 */
const signatureArt = `
COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ
COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ
COJ      COJ      COJ      COJ      COJ      COJ      COJ      COJ
COJ         COJ      Cleef Oligens JOSEPH      COJ         COJ
COJ      COJ      COJ      COJ      COJ      COJ      COJ      COJ
COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ   COJ
COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ COJ
`;

console.log(
  "%c" + signatureArt,
  "color: #f39c12; font-family: monospace; font-weight: bold; font-size: 12px; background: #111; padding: 10px; border-radius: 4px;"
);

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

/* Enregistrement PWA : service worker, hors-ligne, push. */
registerServiceWorker();
