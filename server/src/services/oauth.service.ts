import { google } from "googleapis";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { prisma } from "./prisma";

// ─── Google OAuth ──────────────────────────────────────────────

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
];

function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRedirectUri
  );
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

/** Get the Google consent URL */
export function getGoogleAuthUrl(userId: string): string {
  const client = getGoogleOAuth2Client();
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

  const client = getGoogleOAuth2Client();

  try {
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      return { success: false, error: "No access token received from Google" };
    }

    // Get user email
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email || "";

    // Store tokens in database
    await prisma.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId: stateData.userId,
          provider: "google",
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        scopes: GOOGLE_SCOPES.join(","),
      },
      create: {
        userId: stateData.userId,
        provider: "google",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
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

  const client = getGoogleOAuth2Client();
  client.setCredentials({ refresh_token: tokenRecord.refreshToken });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) return null;

    await prisma.oAuthToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: credentials.access_token,
        expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
      },
    });

    return credentials.access_token;
  } catch (err: any) {
    console.error("[OAuth] Google refresh error:", err.message);
    return null;
  }
}

// ─── Microsoft OAuth ──────────────────────────────────────────

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

/** Get the Microsoft consent URL */
export function getMicrosoftAuthUrl(userId: string): string {
  const state = generateOAuthState(userId, "microsoft");

  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    response_type: "code",
    redirect_uri: config.microsoftRedirectUri,
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

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(`${MS_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        code,
        redirect_uri: config.microsoftRedirectUri,
        grant_type: "authorization_code",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });

    const tokenData = await tokenRes.json();

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
        refreshToken: tokenData.refresh_token || undefined,
        expiresAt,
        scopes: MICROSOFT_SCOPES.join(","),
      },
      create: {
        userId: stateData.userId,
        provider: "microsoft",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
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

  try {
    const tokenRes = await fetch(`${MS_AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.microsoftClientId,
        client_secret: config.microsoftClientSecret,
        refresh_token: tokenRecord.refreshToken,
        grant_type: "refresh_token",
        scope: MICROSOFT_SCOPES.join(" "),
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return null;

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    await prisma.oAuthToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || tokenRecord.refreshToken,
        expiresAt,
      },
    });

    return tokenData.access_token;
  } catch (err: any) {
    console.error("[OAuth] Microsoft refresh error:", err.message);
    return null;
  }
}

// ─── Shared ──────────────────────────────────────────────────

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

/** Disconnect a provider (delete tokens) */
export async function revokeToken(userId: string, provider: string): Promise<void> {
  await prisma.oAuthToken.deleteMany({
    where: { userId, provider },
  });
}

/** Get OAuth status for a user */
export async function getOAuthStatus(userId: string): Promise<Record<string, any>> {
  const tokens = await prisma.oAuthToken.findMany({
    where: { userId },
    select: { provider: true, scopes: true, expiresAt: true },
  });

  const result: Record<string, any> = {
    google: {
      connected: false,
      configured: !!config.googleClientId,
    },
    microsoft: {
      connected: false,
      configured: !!config.microsoftClientId,
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
