import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { GitError } from "./errors";

const VERSION = "v1";

/**
 * Provider tokens are encrypted at rest with AES-256-GCM. The key comes from `CAIRN_SECRET_KEY`
 * (32 random bytes, base64) and never lives in the database. The `context` string is bound as
 * authenticated data, so a ciphertext copied onto another repository does not decrypt.
 */
export function loadSecretKey(env: Record<string, string | undefined> = process.env): Buffer {
  const raw = env.CAIRN_SECRET_KEY;
  if (!raw) {
    throw new GitError(
      "secret_key_missing",
      "CAIRN_SECRET_KEY is not set (32 random bytes, base64)",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new GitError("secret_key_missing", "CAIRN_SECRET_KEY must decode to exactly 32 bytes");
  }
  return key;
}

export function encryptSecret(plain: string, key: Buffer, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, ...[iv, tag, data].map((part) => part.toString("base64url"))].join(".");
}

export function decryptSecret(blob: string, key: Buffer, context: string): string {
  const [version, iv, tag, data] = blob.split(".");
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Unsupported secret format");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** Removes every occurrence of the given secrets (and common encodings) from a piece of text. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    const variants = new Set([
      secret,
      encodeURIComponent(secret),
      Buffer.from(secret).toString("base64"),
    ]);
    for (const v of variants) out = out.split(v).join("***");
  }
  // Credentials embedded in any URL that git echoes back.
  return out.replace(/(https?:\/\/)[^/@\s]+@/g, "$1***@");
}
