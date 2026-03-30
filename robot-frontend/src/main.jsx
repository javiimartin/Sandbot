import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/global.css"; // all app-wide styles
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);