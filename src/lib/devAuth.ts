type RuntimeEnv = Record<string, string | undefined>;

export function getDevAuthConfig(env: RuntimeEnv = process.env) {
  const nodeEnv = env.NODE_ENV ?? "production";
  const allowBypass = env.NEXT_PUBLIC_ALLOW_DEV_AUTH_BYPASS?.trim().toLowerCase();

  return {
    DEV_AUTH_BYPASS: nodeEnv === "development" && allowBypass === "true",
    DEV_AUTH_USER_ID: "e08",
    DEV_AUTH_EMAIL: "kemi.adebayo@zenithcorp.ng",
  };
}

const { DEV_AUTH_BYPASS, DEV_AUTH_USER_ID, DEV_AUTH_EMAIL } = getDevAuthConfig();

export { DEV_AUTH_BYPASS, DEV_AUTH_USER_ID, DEV_AUTH_EMAIL };
