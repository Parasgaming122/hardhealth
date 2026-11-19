import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig, getSupabaseAdminConfig } from "@/lib/supabase/env";

export { authCookieOptions } from "@/lib/supabase/cookie-options";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, authCookieOptions(options));
          });
        } catch {
          // Server Components cannot mutate response cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = getSupabaseAdminConfig();
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
