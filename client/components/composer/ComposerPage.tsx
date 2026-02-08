"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import {
  Inbox,
  FileEdit,
  PenLine,
  Receipt,
  FileText,
  Users,
} from "lucide-react";
import { InboxTab } from "./InboxTab";
import { DraftsTab } from "./DraftsTab";
import { ComposeTab } from "./ComposeTab";
import { InvoicesTab } from "./InvoicesTab";
import { PdfsTab } from "./PdfsTab";
import { PeopleTab } from "./PeopleTab";

const SUB_TABS = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "compose", label: "Compose", icon: PenLine },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "pdfs", label: "PDFs", icon: FileText },
  { key: "people", label: "People", icon: Users },
] as const;

type SubTab = (typeof SUB_TABS)[number]["key"];

export function ComposerPage() {
  const [activeTab, setActiveTab] = useState<SubTab>("inbox");
  const [composeRecipient, setComposeRecipient] = useState<string | undefined>();

  // Seed system tags on first load
  useEffect(() => {
    api.post("/composer/seed-tags").catch(() => {});
  }, []);

  const handleComposeTo = (email: string) => {
    setComposeRecipient(email);
    setActiveTab("compose");
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-hud-text">Composer</h2>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-hud-border pb-0 overflow-x-auto">
        {SUB_TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg
                transition-all duration-200 whitespace-nowrap border-b-2 -mb-[1px]
                ${
                  isActive
                    ? "text-hud-accent border-hud-accent bg-hud-accent/5"
                    : "text-hud-text-secondary border-transparent hover:text-hud-text hover:border-hud-border"
                }
              `}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "inbox" && <InboxTab />}
        {activeTab === "drafts" && <DraftsTab />}
        {activeTab === "compose" && (
          <ComposeTab
            recipient={composeRecipient}
            onClearRecipient={() => setComposeRecipient(undefined)}
          />
        )}
        {activeTab === "invoices" && <InvoicesTab />}
        {activeTab === "pdfs" && <PdfsTab />}
        {activeTab === "people" && <PeopleTab onComposeTo={handleComposeTo} />}
      </div>
    </div>
  );
}
