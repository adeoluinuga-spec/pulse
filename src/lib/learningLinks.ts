import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function learningLinkKey() {
  const secret =
    process.env.LEARNING_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Learning links are not configured.");
  return createHash("sha256")
    .update("pulse-learning:" + secret)
    .digest();
}
export function newLearningLink() {
  const token = randomBytes(32).toString("hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", learningLinkKey(), iv);
  const bytes = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    token_hash: tokenHash(token),
    token_ciphertext: Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
      "base64",
    ),
    expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
    revoked_at: null,
  };
}
export function revealLearningLink(ciphertext: string) {
  const bytes = Buffer.from(ciphertext, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    learningLinkKey(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([
    decipher.update(bytes.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
