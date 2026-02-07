// OpenClaw Gateway Protocol v3 Types

// === Core Message Framing ===

export interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: GatewayError;
}

export interface GatewayEvent {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
  seq?: number;
  stateVersion?: { presence: number; health: number };
}

export type GatewayMessage = GatewayResponse | GatewayEvent;

export interface GatewayError {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
  retryAfterMs?: number;
}

// === Connect Handshake ===

export interface ConnectChallenge {
  nonce: string;
  ts: number;
}

export interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: string;
    displayName?: string;
    instanceId?: string;
  };
  role: "operator" | "node";
  scopes: string[];
  caps: string[];
  commands: string[];
  permissions: Record<string, boolean>;
  auth: {
    token?: string;
    password?: string;
  };
  locale: string;
  userAgent: string;
  device?: {
    id: string;
    publicKey: string;
    signature?: string;
    signedAt?: number;
    nonce?: string;
  };
}

export interface HelloOkPayload {
  type: "hello-ok";
  protocol: number;
  server: {
    version: string;
    commit?: string;
    host?: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  snapshot: {
    presence: unknown[];
    health: Record<string, unknown>;
    stateVersion: { presence: number; health: number };
    uptimeMs: number;
    sessionDefaults?: {
      defaultAgentId: string;
      mainKey: string;
    };
  };
  canvasHostUrl?: string;
  auth?: {
    deviceToken?: string;
    role: string;
    scopes: string[];
    issuedAtMs: number;
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
}

// === Pending Request Tracking ===

export interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// === Event Handler Type ===

export type GatewayEventHandler = (payload: Record<string, unknown>, event: string) => void;
