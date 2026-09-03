import test from "node:test";
import assert from "node:assert/strict";

import { getDevAuthConfig } from "./devAuth.ts";

test("dev auth bypass is off by default and only enabled with explicit local override", () => {
  assert.equal(
    getDevAuthConfig({ NODE_ENV: "production", NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS: "false" }).DEV_AUTH_BYPASS,
    false,
  );

  assert.equal(
    getDevAuthConfig({ NODE_ENV: "development", NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS: "false" }).DEV_AUTH_BYPASS,
    false,
  );

  assert.equal(
    getDevAuthConfig({ NODE_ENV: "development", NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS: "true" }).DEV_AUTH_BYPASS,
    true,
  );
});
