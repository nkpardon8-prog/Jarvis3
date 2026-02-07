import { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";
import { OpenClawGateway } from "../gateway/connection";

export function registerChatHandlers(io: Server, gateway: OpenClawGateway) {
  // OpenClaw uses a single "chat" event with a state field:
  //   state: "delta" | "final" | "error" | "aborted"
  // Payload: { runId, sessionKey, seq, state, message?, errorMessage?, stopReason? }
  gateway.onEvent("chat", (payload: any) => {
    const state = payload?.state;

    if (state === "delta") {
      // Streaming token — extract text from message.content array
      const content = payload?.message?.content;
      let text = "";
      if (Array.isArray(content)) {
        const textBlock = content.find((b: any) => b?.type === "text");
        if (textBlock?.text) {
          text = textBlock.text;
        }
      } else if (typeof content === "string") {
        text = content;
      }

      if (text) {
        io.emit("chat:token", {
          token: text,
          runId: payload.runId,
          sessionKey: payload.sessionKey,
          seq: payload.seq,
        });
      }
    } else if (state === "final") {
      // Message complete
      const content = payload?.message?.content;
      let text = "";
      if (Array.isArray(content)) {
        text = content
          .filter((b: any) => b?.type === "text")
          .map((b: any) => b.text)
          .join("\n");
      } else if (typeof content === "string") {
        text = content;
      }

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
      io.emit("chat:error", {
        error: payload?.errorMessage || "Agent error",
        sessionKey: payload.sessionKey,
      });
      io.emit("chat:status", { status: "idle", sessionKey: payload.sessionKey });
    } else if (state === "aborted") {
      io.emit("chat:status", {
        status: "idle",
        aborted: true,
        sessionKey: payload.sessionKey,
      });
    }
  });

  // Agent events (run start/end)
  gateway.onEvent("agent", (payload: any) => {
    const state = payload?.state;
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

        // Emit thinking status immediately
        io.emit("chat:status", { status: "thinking", sessionKey });

        // Send to gateway
        // deliver: true means deliver events (streaming), false means wait for full response
        await gateway.send("chat.send", {
          sessionKey,
          message,
          deliver: true,
          idempotencyKey,
        }, 120000);
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
