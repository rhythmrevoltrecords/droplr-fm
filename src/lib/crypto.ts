import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function key() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY missing");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  return buf;
}

/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".");
}

export function decrypt(payload: string) {
  const [iv, tag, ct] = payload.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function hashIp(ip: string | null | undefined) {
  if (!ip) return null;
  // Daily-rotating salt: lets us dedupe within a day without storing raw IPs.
  const day = new Date().toISOString().slice(0, 10);
  return sha256(`${ip}|${day}|${process.env.JWT_SECRET ?? ""}`).slice(0, 32);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function jwtKey() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing");
  return new TextEncoder().encode(s);
}

/**
 * Every token says what it's for. Without an audience, a release-email click token (sent to fans, lives 60 days)
 * would also verify as a session cookie.
 */
export type TokenAudience = "session" | "unsub" | "pst" | "dl";

export async function signToken(payload: JWTPayload, expiresIn: string, aud: TokenAudience) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience(aud).setIssuedAt().setExpirationTime(expiresIn).sign(jwtKey());
}

export async function verifyToken<T extends JWTPayload>(token: string | undefined | null, aud: TokenAudience): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ["HS256"], audience: aud });
    return payload as T;
  } catch {
    return null;
  }
}

/**
 * Tokens signed before audiences existed, i.e. links in release emails already sent (unsubscribe links live
 * a year). Only accepts tokens with no aud claim at all; callers must also check the payload shape.
 * Safe to delete after 2027-09 when the last pre-audience unsubscribe token has expired.
 */
export async function verifyLegacyToken<T extends JWTPayload>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey(), { algorithms: ["HS256"] });
    return payload.aud === undefined ? (payload as T) : null;
  } catch {
    return null;
  }
}

/** Constant-time string compare (hashing first makes the lengths equal, so length isn't leaked either). */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
