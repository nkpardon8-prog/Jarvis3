import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { config } from "../config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;

  const envKey = config.oauthEncryptionKey;
  if (envKey) {
    // Accept 64-char hex string (32 bytes) or 44-char base64 (32 bytes)
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      _key = Buffer.from(envKey, "hex");
    } else {
      _key = Buffer.from(envKey, "base64");
    }
    if (_key.length !== 32) {
      throw new Error("OAUTH_CREDENTIALS_ENCRYPTION_KEY must be exactly 32 bytes");
    }
    return _key;
  }

  // Dev fallback: derive from JWT_SECRET (NOT safe for production)
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "OAUTH_CREDENTIALS_ENCRYPTION_KEY is required in production. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }

  console.warn(
    "[Crypto] WARNING: OAUTH_CREDENTIALS_ENCRYPTION_KEY not set — " +
    "deriving from JWT_SECRET. Set a dedicated key for production."
  );
  _key = createHash("sha256").update(config.jwtSecret).digest();
  return _key;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns base64-encoded string: iv (12B) + authTag (16B) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack: iv + authTag + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded string produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const packed = Buffer.from(encoded, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
