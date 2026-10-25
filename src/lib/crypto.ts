import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Keys can be rotated without losing anything.
 *
 *   ENCRYPTION_KEY           the key every new value is encrypted with
 *   ENCRYPTION_KEY_PREVIOUS  optional: the key being retired, still accepted for reading
 *
 * Every value names the key it was made with (a short id: the first 8 hex of the key's sha256,
 * which says nothing about the key), so decrypting never has to guess. Values from before key ids
 * existed have no prefix and are tried against both keys. Rotation, in order: set the new key as
 * ENCRYPTION_KEY and the old one as ENCRYPTION_KEY_PREVIOUS, deploy, and the scheduled release
 * check re-encrypts everything under the new key (lib/key-rotation). When its log line says
 * nothing is left, remove ENCRYPTION_KEY_PREVIOUS.
 */
type Key = { id: string; buf: Buffer };

function parseKey(name: string, required: boolean): Key | null {
  const raw = process.env[name];
  if (!raw) {
    if (required) throw new Error(`${name} missing`);
    return null;
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error(`${name} must be 32 bytes, base64 encoded`);
  return { id: createHash("sha256").update(buf).digest("hex").slice(0, 8), buf };
}

const currentKey = () => parseKey("ENCRYPTION_KEY", true)!;

/** A malformed ENCRYPTION_KEY_PREVIOUS is logged and ignored: throwing would stop every decrypt, OAuth sign-ins included. */
function previousKey(): Key | null {
  try {
    return parseKey("ENCRYPTION_KEY_PREVIOUS", false);
  } catch (e) {
    console.error("[crypto] ENCRYPTION_KEY_PREVIOUS ignored:", e instanceof Error ? e.message : e);
    return null;
  }
}
const readKeys = () => [currentKey(), previousKey()].filter((k): k is Key => !!k);

const PREFIX = "k1:";

/** AES-256-GCM. Output: k1:<key id>:base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string) {
  const k = currentKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k.buf, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${k.id}:${[iv.toString("base64"), tag.toString("base64"), ct.toString("base64")].join(".")}`;
}

function open(buf: Buffer, body: string) {
  const [iv, tag, ct] = body.split(".");
  const decipher = createDecipheriv("aes-256-gcm", buf, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

export function decrypt(payload: string) {
  if (payload.startsWith(PREFIX)) {
    const [, id, body] = payload.split(":");
    const k = readKeys().find((x) => x.id === id);
    if (!k) throw new Error(`No key ${id} configured (ENCRYPTION_KEY / ENCRYPTION_KEY_PREVIOUS)`);
    return open(k.buf, body);
  }
  // From before key ids: whichever key opens it. GCM's tag makes a wrong key fail, never mis-read.
  let last: unknown;
  for (const k of readKeys()) {
    try {
      return open(k.buf, payload);
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error("decrypt failed");
}

/** The prefix every value under the current key starts with. */
export const currentKeyPrefix = () => `${PREFIX}${currentKey().id}:`;

/** True when a value is not under the current key: what lib/key-rotation re-encrypts. */
export function needsReencrypt(payload: string): boolean {
  return !payload.startsWith(currentKeyPrefix());
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
 * Secrets that still verify. JWT_SECRET_PREVIOUS is optional and only for rotating: set the new
 * secret as JWT_SECRET and the old one as JWT_SECRET_PREVIOUS, and nobody is signed out and no
 * emailed link breaks. Remove it once the longest-lived token has expired (unsubscribe links, a
 * year), or sooner if the old secret leaked and breaking those links is the point. Mailchimp
 * webhook URLs are derived from it too and are pasted by hand: see lib/esp/webhook before removing.
 */
export function jwtSecrets(): string[] {
  return [process.env.JWT_SECRET, process.env.JWT_SECRET_PREVIOUS].filter((s): s is string => !!s);
}
const jwtVerifyKeys = () => jwtSecrets().map((s) => new TextEncoder().encode(s));

/**
 * Every token says what it's for. Without an audience, a release-email click token (sent to fans, lives 60 days)
 * would also verify as a session cookie.
 */
export type TokenAudience = "session" | "unsub" | "pst" | "dl" | "confirm";

export async function signToken(payload: JWTPayload, expiresIn: string, aud: TokenAudience) {
  return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setAudience(aud).setIssuedAt().setExpirationTime(expiresIn).sign(jwtKey());
}

export async function verifyToken<T extends JWTPayload>(token: string | undefined | null, aud: TokenAudience): Promise<T | null> {
  if (!token) return null;
  for (const k of jwtVerifyKeys()) {
    try {
      const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"], audience: aud });
      return payload as T;
    } catch {}
  }
  return null;
}

/**
 * Tokens signed before audiences existed, i.e. links in release emails already sent (unsubscribe links live
 * a year). Only accepts tokens with no aud claim at all; callers must also check the payload shape.
 * Safe to delete after 2027-09 when the last pre-audience unsubscribe token has expired.
 */
export async function verifyLegacyToken<T extends JWTPayload>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  for (const k of jwtVerifyKeys()) {
    try {
      const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
      return payload.aud === undefined ? (payload as T) : null;
    } catch {}
  }
  return null;
}

/** Constant-time string compare (hashing first makes the lengths equal, so length isn't leaked either). */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}
