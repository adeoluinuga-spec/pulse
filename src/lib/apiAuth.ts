import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

// Returns the authenticated Supabase user for a route handler, or null.
// Cookie-based: works for same-origin fetches from the app (credentials
// are sent by default). Token is verified against Supabase, not just read.
export async function getRouteUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Read-only check — no cookie writes from API routes.
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
