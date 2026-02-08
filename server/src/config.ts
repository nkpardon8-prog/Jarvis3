import "dotenv/config";

export const config: Record<string, any> & {
  port: number;
  jwtSecret: string;
  jwtExpiresIn: number;
  openclawGatewayUrl: string;
  openclawAuthToken: string;
  databaseUrl: string;
  corsOrigin: string;
  cookieName: string;
  cookieMaxAge: number;
  oauthBaseUrl: string;
  oauthEncryptionKey: string;
  // Legacy OAuth fields (deprecated — migrate to per-user credentials)
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  microsoftClientId: string;
  microsoftClientSecret: string;
  microsoftRedirectUri: string;
} = {
  port: parseInt(process.env.PORT || "3001", 10),
  jwtSecret: process.env.JWT_SECRET || "change-me-in-production",
  jwtExpiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  openclawGatewayUrl: process.env.OPENCLAW_GATEWAY_URL || "ws://127.0.0.1:18789",
  openclawAuthToken: process.env.OPENCLAW_AUTH_TOKEN || "",
  databaseUrl: process.env.DATABASE_URL || "file:./dev.db",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
  cookieName: "jarvis_token",
  cookieMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms

  // OAuth — per-user encryption & callback base URL
  oauthBaseUrl: process.env.OAUTH_BASE_URL || "",
  oauthEncryptionKey: process.env.OAUTH_CREDENTIALS_ENCRYPTION_KEY || "",

  // OAuth — Google (deprecated: legacy env fallback, migrate to per-user credentials)
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || "http://localhost:3001/api/oauth/google/callback",

  // OAuth — Microsoft
  microsoftClientId: process.env.MICROSOFT_CLIENT_ID || "",
  microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || "",
  microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI || "http://localhost:3001/api/oauth/microsoft/callback",
};
