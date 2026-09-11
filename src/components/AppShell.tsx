import { useEffect } from "react";
import { CommandPalette } from "@/components/CommandPalette";
import { MainArea } from "@/components/MainArea";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { openSettingsTab, Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAutoUpdate } from "@/hooks/use-auto-update";
import { useOnboarding } from "@/store/onboarding";

export function AppShell() {
  useAutoUpdate();
  const onboarded = useOnboarding((s) => s.completedAt !== null);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        if (!useOnboarding.getState().completedAt) return;
        openSettingsTab();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return (
    <div className="flex h-screen">
      {onboarded ? (
        <>
          <Sidebar />
          <main className="min-w-0 flex-1">
            <MainArea />
          </main>
          <CommandPalette />
        </>
      ) : (
        <Onboarding />
      )}
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
