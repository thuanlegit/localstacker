import { CommandPalette } from "@/components/CommandPalette";
import { MainArea } from "@/components/MainArea";
import { Sidebar } from "@/components/Sidebar";

export function AppShell() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1">
        <MainArea />
      </main>
      <CommandPalette />
    </div>
  );
}
