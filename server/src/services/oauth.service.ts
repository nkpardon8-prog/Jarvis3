import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "./prisma";
import { encrypt, decrypt } from "./crypto.service";

// ─── Types ───────────────────────────────────────────────

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

// ─── Google OAuth ──────────────────────────────────────────

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
];

// ─── Credential Resolution ───────────────────────────────

function getDefaultRedirectUri(provider: string): string {
  const baseUrl = config.oauthBaseUrl;
  if (baseUrl) {
    return `${baseUrl}/api/oauth/${provider}/callback`;
  }

  // Dev fallback
  if (process.env.NODE_ENV === "production") {
    throw new Error("OAUTH_BASE_URL must be set for OAuth callbacks in production");
  }
  console.warn("[OAuth] OAUTH_BASE_URL not set — falling back to localhost. Set it for production.");
  return `http://localhost:${config.port}/api/oauth/${provider}/callback`;
}

/**
 * Resolve OAuth credentials for a user+provider.
 * Priority: per-user DB → legacy env vars (deprecated)
 */
async function resolveCredentials(userId: string, provider: string): Promise<OAuthCredentials | null> {
  // 1. Per-user DB credentials
  const dbCreds = await getUserOAuthCredentials(userId, provider);
  if (dbCreds) return dbCreds;

  // 2. Legacy env var fallback (deprecated)
  if (provider === "google" && config.googleClientId) {
    console.warn("[OAuth] DEPRECATED: Using global env credentials for Google. Migrate to per-user.");
    return {
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      redirectUri: config.googleRedirectUri || getDefaultRedirectUri("google"),
    };
  }
  if (provider === "microsoft" && config.microsoftClientId) {
    console.warn("[OAuth] DEPRECATED: Using global env credentials for Microsoft. Migrate to per-user.");
    return {
      clientId: config.microsoftClientId,
      clientSecret: config.microsoftClientSecret,
      redirectUri: config.microsoftRedirectUri || getDefaultRedirectUri("microsoft"),
    };
  }

  return null;
}

// ─── Per-User Credential Storage ─────────────────────────

/** Look up per-user OAuth credentials from DB, decrypting clientSecret */
async function getUserOAuthCredentials(userId: string, provider: string): Promise<OAuthCredentials | null> {
  const record = await prisma.oAuthCredential.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (!record) return null;

  return {
    clientId: record.clientId,
    clientSecret: decrypt(record.clientSecret),
    redirectUri: record.redirectUri || getDefaultRedirectUri(provider),
  };
}

/** Store (upsert) per-user OAuth credentials, encrypting clientSecret */
export async function storeUserOAuthCredentials(
  userId: string,
  provider: string,
  clientId: string,
  clientSecret: string,
  redirectUri?: string
): Promise<void> {
  const encryptedSecret = encrypt(clientSecret);

  await prisma.oAuthCredential.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      clientId,
      clientSecret: encryptedSecret,
      redirectUri: redirectUri || null,
    },
    create: {
      userId,
      provider,
      clientId,
      clientSecret: encryptedSecret,
      redirectUri: redirectUri || null,
    },
  });
}

/** Delete per-user OAuth credentials + revoke tokens */
export async function deleteUserOAuthCredentials(userId: string, provider: string): Promise<void> {
  // Revoke tokens first (non-fatal)
  await revokeToken(userId, provider);

  // Delete stored credentials
  await prisma.oAuthCredential.deleteMany({
    where: { userId, provider },
  });
}

// ─── Google API Client ───────────────────────────────────

function getGoogleOAuth2Client(creds: OAuthCredentials) {
  return new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
}

/**
 * Get a configured Google API OAuth2 client with valid access token for a user.
 * Used by email, calendar, and drive routes.
 */
export async function getGoogleApiClient(userId: string) {
  const creds = await resolveCredentials(userId, "google");
  if (!creds) return null;

  const tokens = await getTokensForProvider(userId, "google");
  if (!tokens) return null;

  const client = getGoogleOAuth2Client(creds);
  client.setCredentials({ access_token: tokens.accessToken });
  return client;
}

/** Generate a state JWT containing userId + provider for CSRF protection */
function generateOAuthState(userId: string, provider: string): string {
  return jwt.sign(
    { userId, provider, nonce: Math.random().toString(36).slice(2) },
    config.jwtSecret,
    { expiresIn: 600 } // 10 minutes
  );
}

/** Verify and decode the state JWT */
function verifyOAuthState(state: string): { userId: string; provider: string } | null {
  try {
    const decoded = jwt.verify(state, config.jwtSecret) as any;
    if (decoded.userId && decoded.provider) {
      return { userId: decoded.userId, provider: decoded.provider };
    }
    return null;
  } catch {
    return null;
  }
}

/** Get the Google consent URL (now async — resolves per-user credentials) */
export async function getGoogleAuthUrl(userId: string): Promise<string> {
  const creds = await resolveCredentials(userId, "google");
  if (!creds) {
    throw new Error("Google OAuth not configured. Enter credentials on the Connections page.");
  }

  const client = getGoogleOAuth2Client(creds);
  const state = generateOAuthState(userId, "google");

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GOOGLE_SCOPES,
    state,
  });
}

/** Exchange Google auth code for tokens and store in DB */
export async function handleGoogleCallback(
  code: string,
  state: string
): Promise<{ success: boolean; error?: string }> {
  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== "google") {
    return { success: false, error: "Invalid or expired state parameter" };
  }

  const creds = await resolveCredentials(stateData.userId, "google");
  if (!creds) {
    return { success: false, error: "Google OAuth credentials not found for this user" };
  }

  const client = getGoogleOAuth2Client(creds);

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      return { success: false, error: "No access token received from Google" };
    }

    // Get user email
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    const _email = userInfo.data.email || "";

    // Store tokens in database (encrypt refresh token)
    await prisma.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId: stateData.userId,
          provider: "google",
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: GOOGLE_SCOPES.join(","),
      },
      create: {
        userId: stateData.userId,
        provider: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: GOOGLE_SCOPES.join(","),
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[OAuth] Google callback error:", err.message);
    return { success: false, error: err.message };
  }
}

/** Refresh Google access token if expired */
async function refreshGoogleToken(tokenRecord: any): Promise<string | null> {
  if (!tokenRecord.refreshToken) return null;

  // Resolve credentials for this user
  const creds = await resolveCredentials(tokenRecord.userId, "google");
  if (!creds) return null;

  // Handle both encrypted and legacy plaintext refresh tokens
  let refreshTokenValue: string;
  try {
    refreshTokenValue = decrypt(tokenRecord.refreshToken);
  } catch {
    // Legacy plaintext token — use as-is, will be re-encrypted on next write
    console.warn("[OAuth] Legacy plaintext refresh token detected for Google — will re-encrypt on next refresh");
    refreshTokenValue = tokenRecord.refreshToken;
  }

  const client = getGoogleOAuth2Client(creds);
  client.setCredentials({ refresh_token: refreshTokenValue });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) return null;

    await prisma.oAuthToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token ? encrypt(credentials.refresh_token) : encrypt(refreshTokenValue),
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    });

    return credentials.access_token;
  } catch (err: any) {
    console.error("[OAuth] Google refresh error:", err.message);
    return null;
  }
}

// ─── Microsoft OAuth ──────────────────────────────────────

const MICROSOFT_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Mail.ReadWrite",
  "Calendars.ReadWrite",
  "Files.ReadWrite.All",
  "User.Read",
];

const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";

/** Get the Microsoft consent URL (now async) */
export async function getMicrosoftAuthUrl(userId: string): Promise<string> {
  const creds = await resolveCredentials(userId, "microsoft");
  if (!creds) {
    throw new Error("Microsoft OAuth not configured. Enter credentials on the Connections page.");
  }

  const state = generateOAuthState(userId, "microsoft");

  const params = new URLSearchParams({
    client_id: creds.clientId,
    response_type: "code",
    redirect_uri: creds.redirectUri,
    scope: MICROSOFT_SCOPES.join(" "),
    state,
    response_mode: "query",
    prompt: "consent",
  });

  return `${MS_AUTH_BASE}/authorize?${params.toString()}`;
}

/** Exchange Microsoft auth code for tokens and store in DB */
export async function handleMicrosoftCallback(
  code: string,
  state: string
): Promise<{ success: boolean; error?: string }> {
  const stateData = verifyOAuthState(state);
  if (!stateData || stateData.provider !== "microsoft") {
    return { success: false, error: "Invalid or expired state parameter" };
  }

  const creds = await resolveCredentials(stateData.userId, "microsoft");
  if (!creds) {
    return { success: false, error: "Microsoft OAuth credentials not found for this user" };
  }

  try {
    const tokenRes = await fetch(`${MS_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: creds.redirectUri,
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });

    const tokenData: any = await tokenRes.json();

    if (!tokenData.access_token) {
      return {
        success: false,
        error: tokenData.error_description || tokenData.error || "No access token received",
      };
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId: stateData.userId,
          provider: "microsoft",
        },
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : undefined,
        expiresAt,
        scopes: MICROSOFT_SCOPES.join(","),
      },
      create: {
        userId: stateData.userId,
        provider: "microsoft",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
        expiresAt,
        scopes: MICROSOFT_SCOPES.join(","),
      },
    });

    return { success: true };
  } catch (err: any) {
    console.error("[OAuth] Microsoft callback error:", err.message);
    return { success: false, error: err.message };
  }
}

/** Refresh Microsoft access token if expired */
async function refreshMicrosoftToken(tokenRecord: any): Promise<string | null> {
  if (!tokenRecord.refreshToken) return null;

  const creds = await resolveCredentials(tokenRecord.userId, "microsoft");
  if (!creds) return null;

  // Handle both encrypted and legacy plaintext refresh tokens
  let refreshTokenValue: string;
  try {
    refreshTokenValue = decrypt(tokenRecord.refreshToken);
  } catch {
    console.warn("[OAuth] Legacy plaintext refresh token detected for Microsoft — will re-encrypt on next refresh");
    refreshTokenValue = tokenRecord.refreshToken;
  }

  try {
    const tokenRes = await fetch(`${MS_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        refresh_token: refreshTokenValue,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });

    const tokenData: any = await tokenRes.json();
    if (!tokenData.access_token) return null;

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.oAuthToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : encrypt(refreshTokenValue),
        expiresAt,
      },
    });

    return tokenData.access_token;
  } catch (err: any) {
    console.error("[OAuth] Microsoft refresh error:", err.message);
    return null;
  }
}

// ─── Shared ──────────────────────────────────────────────

/** Get valid access token for a provider, auto-refreshing if needed */
export async function getTokensForProvider(
  userId: string,
  provider: string
): Promise<{ accessToken: string; scopes: string } | null> {
  const tokenRecord = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
  });

  if (!tokenRecord) return null;

  // Check if token is expired or about to expire (5 min buffer)
  const isExpired = tokenRecord.expiresAt
    ? tokenRecord.expiresAt.getTime() < Date.now() + 5 * 60 * 1000
    : false;

  if (isExpired) {
    let newToken: string | null = null;
    if (provider === "google") {
      newToken = await refreshGoogleToken(tokenRecord);
    } else if (provider === "microsoft") {
      newToken = await refreshMicrosoftToken(tokenRecord);
    }

    if (!newToken) return null;

    return { accessToken: newToken, scopes: tokenRecord.scopes || "" };
  }

  return { accessToken: tokenRecord.accessToken, scopes: tokenRecord.scopes || "" };
}

/** Disconnect a provider — revoke tokens at provider + delete from DB */
export async function revokeToken(userId: string, provider: string): Promise<void> {
  const tokenRecord = await prisma.oAuthToken.findUnique({
    where: { userId_provider: { userId, provider } },
  });

  if (tokenRecord) {
    // Call provider's revocation endpoint (non-fatal on failure)
    if (provider === "google" && tokenRecord.accessToken) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenRecord.accessToken)}`,
          { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
      } catch (err: any) {
        console.warn("[OAuth] Google revocation failed (non-fatal):", err.message);
      }
    }

    await prisma.oAuthToken.deleteMany({
      where: { userId, provider },
    });
  }
}

/** Get OAuth status for a user */
export async function getOAuthStatus(userId: string): Promise<Record<string, any>> {
  const tokens = await prisma.oAuthToken.findMany({
    where: { userId },
    select: { provider: true, scopes: true, expiresAt: true },
  });

  // Check per-user credentials in DB
  const credentials = await prisma.oAuthCredential.findMany({
    where: { userId },
    select: { provider: true },
  });
  const hasDbCreds = new Set(credentials.map((c) => c.provider));

  const result: Record<string, any> = {
    google: {
      connected: false,
      configured: hasDbCreds.has("google") || !!config.googleClientId,
    },
    microsoft: {
      connected: false,
      configured: hasDbCreds.has("microsoft") || !!config.microsoftClientId,
    },
  };

  for (const token of tokens) {
    if (result[token.provider]) {
      result[token.provider].connected = true;
      result[token.provider].scopes = token.scopes?.split(",") || [];
      result[token.provider].expiresAt = token.expiresAt;
    }
  }

  return result;
}
