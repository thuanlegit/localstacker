import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { applyThemeToDocument, useTheme } from "@/store/theme";

function App() {
  const mode = useTheme((s) => s.mode);
  const palette = useTheme((s) => s.palette);

  useEffect(() => {
    applyThemeToDocument(mode, palette);
  }, [mode, palette]);

  useEffect(() => {
    if (mode !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeToDocument("system", useTheme.getState().palette);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  return <AppShell />;
}

export default App;
