"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { HudButton } from "@/components/ui/HudButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  Users,
  Search,
  Mail,
  Calendar,
  ChevronDown,
  ChevronUp,
  PenLine,
} from "lucide-react";

interface PeopleTabProps {
  onComposeTo: (email: string) => void;
}

interface Contact {
  name: string;
  email: string;
  lastContact: string;
  interactionCount: number;
}

interface RecentEmail {
  subject: string;
  from: string;
  date: string;
}

interface SearchResult {
  query: string;
  contacts: Contact[];
  recentEmails: RecentEmail[];
  summary: string;
}

export function PeopleTab({ onComposeTo }: PeopleTabProps) {
  const [query, setQuery] = useState("");
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);

  const search = useMutation({
    mutationFn: async (q: string) => {
      const res = await api.post<SearchResult>("/composer/people/search", { query: q });
      if (!res.ok) throw new Error(res.error);
      return res.data!;
    },
  });

  const handleSearch = () => {
    if (!query.trim()) return;
    search.mutate(query);
  };

  const result = search.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-hud-accent" />
        <h3 className="text-sm font-semibold text-hud-text">People & Relationships</h3>
      </div>

      {/* Search */}
      <GlassPanel>
        <p className="text-xs text-hud-text-muted mb-2">
          Search by name or email to see interaction history and relationship insights
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by name or email..."
            className="flex-1 bg-hud-bg-secondary/50 border border-hud-border rounded-lg px-3 py-2 text-xs text-hud-text placeholder:text-hud-text-muted/50 focus:outline-none focus:border-hud-accent/50"
          />
          <HudButton
            size="sm"
            onClick={handleSearch}
            disabled={!query.trim() || search.isPending}
          >
            {search.isPending ? <LoadingSpinner size="sm" /> : <Search size={12} />}
            Search
          </HudButton>
        </div>
      </GlassPanel>

      {/* Results */}
      {search.isError && (
        <GlassPanel className="border-hud-error/30">
          <p className="text-xs text-hud-error">{(search.error as Error).message}</p>
        </GlassPanel>
      )}

      {result && (
        <div className="space-y-4">
          {/* AI Summary */}
          {result.summary && (
            <GlassPanel className="border-hud-accent/30">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-hud-accent" />
                <p className="text-xs font-medium text-hud-accent">Relationship Summary</p>
              </div>
              <p className="text-xs text-hud-text">{result.summary}</p>
            </GlassPanel>
          )}

          {/* Contacts */}
          {result.contacts.length > 0 ? (
            <div className="space-y-3">
              {result.contacts.map((contact) => {
                const isExpanded = expandedEmail === contact.email;
                const contactEmails = result.recentEmails.filter(
                  (e) => e.from.includes(contact.email) || e.from.includes(contact.name)
                );

                return (
                  <GlassPanel key={contact.email}>
                    <div
                      className="flex items-start gap-3 cursor-pointer"
                      onClick={() => setExpandedEmail(isExpanded ? null : contact.email)}
                    >
                      <div className="w-8 h-8 rounded-full bg-hud-accent/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-hud-accent">
                          {contact.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-hud-text">
                          {contact.name}
                        </p>
                        <p className="text-[10px] text-hud-text-muted">{contact.email}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[10px] text-hud-text-muted">
                          <span className="flex items-center gap-1">
                            <Mail size={9} />
                            {contact.interactionCount} interactions
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar size={9} />
                            Last: {new Date(contact.lastContact).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <HudButton
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            onComposeTo(contact.email);
                          }}
                        >
                          <PenLine size={10} /> Compose
                        </HudButton>
                        {isExpanded ? (
                          <ChevronUp size={14} className="text-hud-text-muted" />
                        ) : (
                          <ChevronDown size={14} className="text-hud-text-muted" />
                        )}
                      </div>
                    </div>

                    {isExpanded && contactEmails.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-hud-border">
                        <p className="text-[10px] text-hud-text-muted mb-2 uppercase">
                          Recent Emails
                        </p>
                        <div className="space-y-1">
                          {contactEmails.map((email, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-2 px-2 py-1.5 bg-white/3 rounded"
                            >
                              <Mail size={10} className="text-hud-text-muted shrink-0" />
                              <p className="text-xs text-hud-text-secondary truncate flex-1">
                                {email.subject}
                              </p>
                              <span className="text-[9px] text-hud-text-muted shrink-0">
                                {new Date(email.date).toLocaleDateString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </GlassPanel>
                );
              })}
            </div>
          ) : (
            <GlassPanel>
              <p className="text-xs text-hud-text-muted text-center py-6">
                No contacts found for &quot;{result.query}&quot;. Try a different search term.
              </p>
            </GlassPanel>
          )}
        </div>
      )}

      {!result && !search.isPending && (
        <GlassPanel>
          <div className="text-center py-12">
            <Users size={32} className="mx-auto text-hud-text-muted mb-3" />
            <p className="text-xs text-hud-text-secondary">
              Search for someone to see relationship insights
            </p>
            <p className="text-[10px] text-hud-text-muted mt-1">
              AI aggregates data from emails, drafts, and CRM to build relationship profiles
            </p>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
