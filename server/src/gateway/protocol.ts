import { randomUUID } from "crypto";
import {
  GatewayRequest,
  GatewayMessage,
  ConnectChallenge,
  ConnectParams,
} from "./types";
import { config } from "../config";

export function generateRequestId(): string {
  return randomUUID();
}

export function buildRequest(
  method: string,
  params: Record<string, unknown>
): GatewayRequest {
  return {
    type: "req",
    id: generateRequestId(),
    method,
    params,
  };
}

export function buildConnectRequest(
  _challenge: ConnectChallenge
): GatewayRequest {
  const params: ConnectParams = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: "gateway-client",
      version: "1.0.0",
      platform: "web",
      mode: "ui",
      displayName: "Jarvis Dashboard",
    },
    role: "operator",
    scopes: ["operator.read", "operator.write", "operator.admin"],
    caps: [],
    commands: [],
    permissions: {},
    auth: {
      token: config.openclawAuthToken,
    },
    locale: "en-US",
    userAgent: "jarvis-dashboard/1.0.0",
  };

  return {
    type: "req",
    id: "connect-" + generateRequestId(),
    method: "connect",
    params: params as unknown as Record<string, unknown>,
  };
}

export function parseMessage(raw: string): GatewayMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg.type === "res" || msg.type === "event") {
      return msg;
    }
    console.warn("[Gateway] Unknown message type:", msg.type);
    return null;
  } catch (err) {
    console.error("[Gateway] Failed to parse message:", err);
    return null;
  }
}
