import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";
import { OpenClawGateway } from "../gateway/connection";

/**
 * Extract text from various OpenClaw content formats:
 * - string
 * - array of content blocks (text, output_text, markdown, etc.)
 * - object with .text, .content, .value, or .delta string
 */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Accept any block that has a text-like string field
    const TEXT_BLOCK_TYPES = new Set(["text", "output_text", "markdown", "code", "result"]);
    return content
      .filter((b: any) => {
        if (!b || typeof b !== "object") return false;
        // Accept blocks with known text types, or any block with a text/value string
        if (b.type && TEXT_BLOCK_TYPES.has(b.type) && typeof b.text === "string") return true;
        if (typeof b.text === "string") return true;
        if (typeof b.value === "string") return true;
        return false;
      })
      .map((b: any) => b.text || b.value || "")
      .join("\n");
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.delta === "string") return obj.delta;
  }
  return "";
}

/**
 * Try multiple payload shapes to find text content.
 * Gateway payloads vary: message.content, content, text, message.text, output, delta, etc.
 */
function extractMessageText(payload: any): string {
  if (!payload) return "";
  return (
    extractText(payload?.message?.content) ||
    extractText(payload?.content) ||
    (typeof payload?.text === "string" ? payload.text : "") ||
    (typeof payload?.message?.text === "string" ? payload.message.text : "") ||
    (typeof payload?.output === "string" ? payload.output : "") ||
    (typeof payload?.delta === "string" ? payload.delta : "") ||
    extractText(payload?.message) ||
    ""
  );
}

export function registerChatHandlers(io: Server, gateway: OpenClawGateway) {
  // Track active runs so we can detect when the RPC response IS the final answer
  const activeRuns = new Set<string>();

  // Clear stale runs on gateway reconnect (runs are lost after restart)
  gateway.on("connected", () => {
    if (activeRuns.size > 0) {
      console.log(`[Chat] Gateway reconnected — clearing ${activeRuns.size} stale active runs`);
      activeRuns.clear();
    }
  });

  // Handle system events (GatewayRestart, etc.) — don't let them silently swallow in-flight messages
  gateway.onEvent("system", (payload: any) => {
    console.log(`[Chat] System event: ${payload?.type || payload?.event || JSON.stringify(payload).slice(0, 120)}`);
    if (activeRuns.size > 0) {
      console.log(`[Chat] System event while ${activeRuns.size} runs active — clearing runs, emitting idle`);
      activeRuns.clear();
      io.emit("chat:status", { status: "idle" });
    }
  });

  // OpenClaw emits "chat" events with a state field:
  //   state: "delta" | "final" | "error" | "aborted"
  gateway.onEvent("chat", (payload: any) => {
    const state = payload?.state;
    const runId = payload?.runId;
    console.log(`[Chat] Gateway event: state=${state || "none"}, runId=${runId || "?"}, session=${payload?.sessionKey || "?"}`);

    if (state === "delta") {
      const text = extractMessageText(payload);
      if (text) {
        activeRuns.add(payload.runId);
        io.emit("chat:token", {
          token: text,
          runId: payload.runId,
          sessionKey: payload.sessionKey,
          seq: payload.seq,
        });
      }
    } else if (state === "final") {
      const text = extractMessageText(payload);
      activeRuns.delete(payload.runId);
      console.log(`[Chat] Final message: ${text ? text.slice(0, 80) + "..." : "(empty)"}`);

      io.emit("chat:message", {
        id: payload.runId || `msg-${Date.now()}`,
        content: text,
        role: "assistant",
        timestamp: payload?.message?.timestamp
          ? new Date(payload.message.timestamp).toISOString()
          : new Date().toISOString(),
        sessionKey: payload.sessionKey,
      });

      io.emit("chat:status", { status: "idle", sessionKey: payload.sessionKey });
    } else if (state === "error") {
      activeRuns.delete(payload.runId);
      console.log(`[Chat] Run error: ${payload?.errorMessage || "unknown"}`);
      io.emit("chat:error", {
        error: payload?.errorMessage || "Agent error",
        sessionKey: payload.sessionKey,
      });
      io.emit("chat:status", { status: "idle", sessionKey: payload.sessionKey });
    } else if (state === "aborted") {
      activeRuns.delete(payload.runId);
      io.emit("chat:status", {
        status: "idle",
        aborted: true,
        sessionKey: payload.sessionKey,
      });
    } else if (!state) {
      // Fallback: no state field — treat as final if there's text content
      const text = extractMessageText(payload);
      if (text) {
        console.log(`[Chat] No-state fallback message: ${text.slice(0, 80)}...`);
        io.emit("chat:message", {
          id: payload.runId || payload.id || `msg-${Date.now()}`,
          content: text,
          role: "assistant",
          timestamp: new Date().toISOString(),
          sessionKey: payload.sessionKey,
        });
        io.emit("chat:status", { status: "idle", sessionKey: payload.sessionKey });
      }
    }
  });

  // Agent events (run start/end)
  gateway.onEvent("agent", (payload: any) => {
    const state = payload?.state;
    console.log(`[Chat] Agent event: state=${state}, session=${payload?.sessionKey || "?"}`);
    if (state === "running" || state === "thinking") {
      io.emit("chat:status", { status: "thinking", sessionKey: payload.sessionKey });
    } else if (state === "idle" || state === "done") {
      io.emit("chat:status", { status: "idle", sessionKey: payload.sessionKey });
    }
  });

  // Handle individual socket connections
  io.on("connection", (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.data.user?.username}`);

    // Send a message to the agent
    socket.on("chat:send", async (data: { sessionKey: string; message: string }) => {
      try {
        const { sessionKey, message } = data;
        if (!sessionKey || !message) {
          socket.emit("chat:error", { error: "sessionKey and message are required" });
          return;
        }

        const idempotencyKey = randomUUID();
        console.log(`[Chat] Sending to gateway: session=${sessionKey}, idempotency=${idempotencyKey.slice(0, 8)}`);

        // Emit thinking status immediately
        io.emit("chat:status", { status: "thinking", sessionKey });

        // Send to gateway — deliver: true requests event-based streaming.
        // The RPC response may be just { runId, status } or may contain the full answer.
        const result = await gateway.send("chat.send", {
          sessionKey,
          message,
          deliver: true,
          idempotencyKey,
        }, 120000) as any;

        console.log(`[Chat] RPC response: status=${result?.status}, runId=${result?.runId || "?"}`);

        // Fallback: if the RPC response itself contains the assistant message
        // (happens when gateway returns the full response inline instead of via events)
        if (result) {
          const runId = result.runId || idempotencyKey;
          // Only emit if the event handler didn't already handle this run
          if (!activeRuns.has(runId) && result.status !== "started" && result.status !== "in_flight") {
            const text = extractMessageText(result);
            if (text) {
              console.log(`[Chat] RPC fallback message: ${text.slice(0, 80)}...`);
              io.emit("chat:message", {
                id: runId,
                content: text,
                role: "assistant",
                timestamp: new Date().toISOString(),
                sessionKey,
              });
              io.emit("chat:status", { status: "idle", sessionKey });
            }
          }
        }
      } catch (err: any) {
        console.error("[Socket] Chat send error:", err.message);
        socket.emit("chat:error", { error: err.message });
        io.emit("chat:status", { status: "idle" });
      }
    });

    // Abort an in-progress response
    socket.on("chat:abort", async (data: { sessionKey: string }) => {
      try {
        await gateway.send("chat.abort", { sessionKey: data.sessionKey });
      } catch (err: any) {
        console.error("[Socket] Chat abort error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[Socket] Client disconnected: ${socket.data.user?.username}`);
    });
  });
}
