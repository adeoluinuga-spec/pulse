type RuntimeEnv = Record<string, string | undefined>;

export function isDemoModeEnabled(env: RuntimeEnv = process.env): boolean {
  return env.NEXT_PUBLIC_ENABLE_DEMO_MODE?.trim().toLowerCase() === "true";
}

export function getDemoModeConfig(env: RuntimeEnv = process.env) {
  return {
    DEMO_MODE: isDemoModeEnabled(env),
    DEMO_ORG_NAME: "Pulse Demo Workspace",
    DEMO_USER_EMAIL: "demo.user@pulse.local",
  };
}

export function getDevAuthConfig(env: RuntimeEnv = process.env) {
  const nodeEnv = env.NODE_ENV ?? "production";
  const allowBypass = env.NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS?.trim().toLowerCase();

  return {
    DEV_AUTH_BYPASS: nodeEnv === "development" && allowBypass === "true",
    DEV_AUTH_USER_ID: "local-dev-user",
    DEV_AUTH_EMAIL: "dev.user@pulse.local",
  };
}

const { DEV_AUTH_BYPASS, DEV_AUTH_USER_ID, DEV_AUTH_EMAIL } = getDevAuthConfig();
const { DEMO_MODE, DEMO_ORG_NAME, DEMO_USER_EMAIL } = getDemoModeConfig();

export { DEV_AUTH_BYPASS, DEV_AUTH_USER_ID, DEV_AUTH_EMAIL, DEMO_MODE, DEMO_ORG_NAME, DEMO_USER_EMAIL };
