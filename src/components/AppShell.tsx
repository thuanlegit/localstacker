import { CommandPalette } from "@/components/CommandPalette";
import { MainArea } from "@/components/MainArea";
import { Sidebar } from "@/components/Sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAutoUpdate } from "@/hooks/use-auto-update";

export function AppShell() {
  useAutoUpdate();
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
