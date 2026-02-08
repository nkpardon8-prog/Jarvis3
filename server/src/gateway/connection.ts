import WebSocket from "ws";
import { EventEmitter } from "events";
import { config } from "../config";
import {
  GatewayResponse,
  GatewayEvent,
  HelloOkPayload,
  PendingRequest,
  GatewayEventHandler,
} from "./types";
import {
  buildConnectRequest,
  buildRequest,
  parseMessage,
} from "./protocol";

const MAX_RECONNECT_DELAY = 30000;
const DEFAULT_TIMEOUT = 30000;

export class OpenClawGateway extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private connecting = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private eventHandlers = new Map<string, Set<GatewayEventHandler>>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = 1000;
  private tickTimer: NodeJS.Timeout | null = null;
  private tickIntervalMs = 15000;
  private serverInfo: HelloOkPayload | null = null;
  private _availableMethods: string[] = [];
  private _sessionDefaults: { defaultAgentId: string; mainKey: string } | null = null;

  get isConnected(): boolean {
    return this.connected;
  }

  get availableMethods(): string[] {
    return this._availableMethods;
  }

  get sessionDefaults(): { defaultAgentId: string; mainKey: string } | null {
    return this._sessionDefaults;
  }

  get info(): HelloOkPayload | null {
    return this.serverInfo;
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    this.connecting = true;

    return new Promise((resolve, reject) => {
      const url = config.openclawGatewayUrl;
      console.log(`[Gateway] Connecting to ${url}...`);

      this.ws = new WebSocket(url);

      const connectTimeout = setTimeout(() => {
        this.connecting = false;
        this.ws?.close();
        reject(new Error("Gateway connection timeout"));
      }, 15000);

      this.ws.on("open", () => {
        console.log("[Gateway] WebSocket connected, waiting for challenge...");
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        const raw = data.toString();
        const msg = parseMessage(raw);
        if (!msg) return;

        // During handshake, handle challenge and hello-ok
        if (!this.connected) {
          if (msg.type === "event" && msg.event === "connect.challenge") {
            console.log("[Gateway] Received challenge, sending connect...");
            const connectReq = buildConnectRequest(msg.payload as any);
            this.ws!.send(JSON.stringify(connectReq));

            // Store the connect request ID to match response
            const connectId = connectReq.id;
            const origHandler = this.ws!.listeners("message");

            // We need to wait for the connect response
            const handleConnectResponse = (responseData: WebSocket.Data) => {
              const resp = parseMessage(responseData.toString());
              if (!resp) return;

              if (resp.type === "res" && (resp as GatewayResponse).id === connectId) {
                clearTimeout(connectTimeout);
                this.ws!.removeListener("message", handleConnectResponse);

                if ((resp as GatewayResponse).ok) {
                  const payload = (resp as GatewayResponse).payload as unknown as HelloOkPayload;
                  this.serverInfo = payload;
                  this.connected = true;
                  this.connecting = false;
                  this.reconnectDelay = 1000;

                  // Store session defaults and available methods
                  if (payload.features?.methods) {
                    this._availableMethods = payload.features.methods;
                  }
                  if (payload.snapshot?.sessionDefaults) {
                    this._sessionDefaults = payload.snapshot.sessionDefaults;
                  }

                  // Start tick/keepalive
                  if (payload.policy?.tickIntervalMs) {
                    this.tickIntervalMs = payload.policy.tickIntervalMs;
                  }
                  this.startTick();

                  console.log(
                    `[Gateway] Connected! Protocol v${payload.protocol}, ` +
                    `server v${payload.server?.version}, ` +
                    `${payload.features?.methods?.length || 0} methods available`
                  );
                  this.emit("connected", payload);
                  resolve();
                } else {
                  const error = (resp as GatewayResponse).error;
                  this.connecting = false;
                  console.error("[Gateway] Connect rejected:", error);
                  reject(new Error(`Gateway connect rejected: ${error?.message || "unknown"}`));
                }
              }
            };

            this.ws!.on("message", handleConnectResponse);
            return;
          }
          return;
        }

        // After handshake, route messages normally
        this.handleMessage(msg);
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[Gateway] Disconnected (code=${code}, reason=${reason?.toString() || "none"})`);
        this.handleDisconnect();
        if (this.connecting) {
          clearTimeout(connectTimeout);
          this.connecting = false;
          reject(new Error("Gateway connection closed during handshake"));
        }
      });

      this.ws.on("error", (err) => {
        console.error("[Gateway] WebSocket error:", err.message);
        if (this.connecting) {
          clearTimeout(connectTimeout);
          this.connecting = false;
          reject(err);
        }
      });
    });
  }

  /** Disconnect and reconnect with current config values */
  async reconnect(): Promise<void> {
    this.disconnect();
    // Small delay to ensure clean shutdown
    await new Promise((r) => setTimeout(r, 200));
    return this.connect();
  }

  disconnect(): void {
    this.stopTick();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.connecting = false;

    // Reject all pending requests
    for (const [id, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("Gateway disconnected"));
    }
    this.pendingRequests.clear();
  }

  async send(method: string, params: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT): Promise<unknown> {
    if (!this.connected || !this.ws) {
      throw new Error("Gateway not connected");
    }

    const req = buildRequest(method, params);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(req.id);
        reject(new Error(`Gateway request timeout: ${method} (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pendingRequests.set(req.id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(req));
    });
  }

  onEvent(event: string, handler: GatewayEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  offEvent(event: string, handler: GatewayEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  private handleMessage(msg: GatewayResponse | GatewayEvent): void {
    if (msg.type === "res") {
      const response = msg as GatewayResponse;
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(response.id);

        if (response.ok) {
          pending.resolve(response.payload);
        } else {
          const err = new Error(
            response.error?.message || `Gateway error: ${response.error?.code || "unknown"}`
          );
          (err as any).code = response.error?.code;
          (err as any).details = response.error?.details;
          (err as any).retryable = response.error?.retryable;
          pending.reject(err);
        }
      }
    } else if (msg.type === "event") {
      const event = msg as GatewayEvent;

      // Build effective payload: gateway may put fields at top level or inside payload
      let effectivePayload = event.payload;
      if (!effectivePayload || Object.keys(effectivePayload).length === 0) {
        // Fields are at the event root — extract everything except framing keys
        const { type: _t, event: _e, seq: _s, stateVersion: _sv, payload: _p, ...rest } = msg as any;
        effectivePayload = rest;
      }

      // Emit to specific handlers
      const handlers = this.eventHandlers.get(event.event);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(effectivePayload, event.event);
          } catch (err) {
            console.error(`[Gateway] Event handler error for ${event.event}:`, err);
          }
        }
      }

      // Also emit via EventEmitter for generic listening
      this.emit("gateway:event", event);
    }
  }

  private handleDisconnect(): void {
    const wasConnected = this.connected;
    this.connected = false;
    this.stopTick();

    // Reject all pending requests
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("Gateway disconnected"));
    }
    this.pendingRequests.clear();

    if (wasConnected) {
      this.emit("disconnected");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    console.log(`[Gateway] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (err: any) {
        console.error("[Gateway] Reconnect failed:", err.message);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
        this.scheduleReconnect();
      }
    }, this.reconnectDelay);
  }

  private startTick(): void {
    this.stopTick();
    this.tickTimer = setInterval(async () => {
      try {
        await this.send("health", {}, 10000);
      } catch {
        // Tick failure is not critical — disconnect handler will manage
      }
    }, this.tickIntervalMs);
  }

  private stopTick(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }
}

// Singleton instance
export const gateway = new OpenClawGateway();
