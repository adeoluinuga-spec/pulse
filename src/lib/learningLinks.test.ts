import test from "node:test";
import assert from "node:assert/strict";
import {
  learningLinkKey,
  newLearningLink,
  revealLearningLink,
  tokenHash,
} from "./learningLinks.ts";

test("personal links are random, hashed at rest and recoverable only with the encryption key", () => {
  const previous = process.env.LEARNING_LINK_SECRET;
  process.env.LEARNING_LINK_SECRET = "test-only-learning-secret";
  try {
    assert.equal(
      tokenHash("hello"),
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    assert.equal(learningLinkKey().length, 32);
    const one = newLearningLink(),
      two = newLearningLink();
    const token = revealLearningLink(one.token_ciphertext);
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(tokenHash(token), one.token_hash);
    assert.notEqual(one.token_hash, two.token_hash);
    assert.ok(!JSON.stringify(one).includes(token));
    assert.ok(Date.parse(one.expires_at) > Date.now() + 179 * 86400000);
    const bytes = Buffer.from(one.token_ciphertext, "base64");
    bytes[30] ^= 1;
    assert.throws(() => revealLearningLink(bytes.toString("base64")));
    process.env.LEARNING_LINK_SECRET = "different-test-secret";
    assert.throws(() => revealLearningLink(one.token_ciphertext));
  } finally {
    if (previous === undefined) delete process.env.LEARNING_LINK_SECRET;
    else process.env.LEARNING_LINK_SECRET = previous;
  }
});
