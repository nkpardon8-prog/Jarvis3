import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { JWTPayload } from "../types";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateJWT(payload: {
  userId: string;
  username: string;
  role: string;
}): string {
  const secret: jwt.Secret = config.jwtSecret;
  const options: jwt.SignOptions = {
    expiresIn: config.jwtExpiresIn,
  };
  return jwt.sign(payload, secret, options);
}

export function verifyJWT(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
  } catch {
    return null;
  }
}
