import { useEffect } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { MainArea } from "@/components/MainArea";
import { openSettingsTab, Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAutoUpdate } from "@/hooks/use-auto-update";

export function AppShell() {
  useAutoUpdate();
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        openSettingsTab();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <MainArea />
      </main>
      <CommandPalette />
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
