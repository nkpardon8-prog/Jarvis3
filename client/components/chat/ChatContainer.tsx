"use client";

import { useState } from "react";
import { useChat } from "@/lib/hooks/useChat";
import { useSocket } from "@/lib/hooks/useSocket";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { ChatSidebar } from "./ChatSidebar";
import { PanelLeftOpen, PanelLeftClose, Wifi, WifiOff } from "lucide-react";

export function ChatContainer() {
  const { connected } = useSocket();
  const {
    messages,
    streamingText,
    isStreaming,
    awaitingResponse,
    sessions,
    currentSessionKey,
    sendMessage,
    abortMessage,
    switchSession,
    resetSession,
    loadSessions,
    error,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isProcessing = awaitingResponse || isStreaming;

  return (
    <div className="flex h-full overflow-hidden rounded-xl border border-hud-border bg-hud-bg-primary/30">
      {/* Sidebar - hidden on mobile unless toggled */}
      <div
        className={`${
          sidebarOpen ? "block" : "hidden"
        } lg:block w-64 flex-shrink-0`}
      >
        <ChatSidebar
          sessions={sessions}
          currentSessionKey={currentSessionKey}
          onSwitchSession={(key) => {
            switchSession(key);
            setSidebarOpen(false);
          }}
          onLoadSessions={loadSessions}
          onResetSession={resetSession}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-hud-border bg-hud-bg-primary/50">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 rounded-lg text-hud-text-muted hover:text-hud-text hover:bg-white/5 transition-colors lg:hidden"
            >
              {sidebarOpen ? (
                <PanelLeftClose size={18} />
              ) : (
                <PanelLeftOpen size={18} />
              )}
            </button>
            <div>
              <h3 className="text-sm font-medium text-hud-text">Chat Agent</h3>
              <p className="text-[10px] text-hud-text-muted truncate max-w-[200px]">
                {currentSessionKey || "No session"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {connected ? (
              <div className="flex items-center gap-1.5 text-hud-success">
                <Wifi size={12} />
                <span className="text-[10px]">Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-hud-error">
                <WifiOff size={12} />
                <span className="text-[10px]">Disconnected</span>
              </div>
            )}
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-hud-error/10 border-b border-hud-error/20 text-xs text-hud-error">
            {error}
          </div>
        )}

        {/* Messages area */}
        <ChatMessages
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          awaitingResponse={awaitingResponse}
        />

        {/* Input bar */}
        <ChatInput
          onSend={sendMessage}
          onAbort={abortMessage}
          isProcessing={isProcessing}
          disabled={!connected}
        />
      </div>
    </div>
  );
}
