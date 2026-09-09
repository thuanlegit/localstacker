import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { applyThemeToDocument, useTheme } from "@/store/theme";

function App() {
  const theme = useTheme((s) => s.theme);

  useEffect(() => applyThemeToDocument(theme), [theme]);

  return <AppShell />;
}

export default App;
