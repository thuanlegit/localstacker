import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppearanceSection } from "./AppearanceSection";
import { ConnectionsSection } from "./ConnectionsSection";
import { UpdatesSection } from "./UpdatesSection";

export type SectionId = "appearance" | "connections" | "updates" | "data";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "connections", label: "Connections" },
  { id: "updates", label: "Updates & About" },
  { id: "data", label: "Data" },
];

export function SettingsView() {
  const [activeSection, setActiveSection] = useState<SectionId>("appearance");

  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 border-r border-border p-3 space-y-1">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => setActiveSection(section.id)}
            className={cn(
              "w-full text-left rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
              activeSection === section.id
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground",
            )}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">
          {activeSection === "appearance" && <AppearanceSection />}
          {activeSection === "connections" && <ConnectionsSection />}
          {activeSection === "updates" && <UpdatesSection />}
        </div>
      </div>
    </div>
  );
}
