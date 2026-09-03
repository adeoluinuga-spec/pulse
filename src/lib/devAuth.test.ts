import test from "node:test";
import assert from "node:assert/strict";

import { getDemoModeConfig, getDevAuthConfig } from "./devAuth.ts";

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

test("demo mode is opt-in and not defaulted on for the live SaaS platform", () => {
  assert.equal(getDemoModeConfig({ NEXT_PUBLIC_ENABLE_DEMO_MODE: "false" }).DEMO_MODE, false);
  assert.equal(getDemoModeConfig({}).DEMO_MODE, false);
  assert.equal(getDemoModeConfig({ NEXT_PUBLIC_ENABLE_DEMO_MODE: "true" }).DEMO_MODE, true);
});
