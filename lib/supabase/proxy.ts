import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

const protectedRoots = ["patient", "doctor", "front-desk", "pharmacy", "lab", "provider-admin", "admin"];

export async function updateSupabaseSession(request: NextRequest) {
  const firstSegment = request.nextUrl.pathname.split("/").filter(Boolean)[0];
  if (request.nextUrl.pathname !== "/login" && !protectedRoots.includes(firstSegment ?? "")) {
    return NextResponse.next({ request });
  }

  // Defense in depth for any future matcher expansion: a missing env must never
  // bubble up as a 500 — the root proxy redirects to /setup, and this fallback
  // does the same if it is reached with incomplete configuration.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return NextResponse.redirect(url, 307);
  }

  const { url, publishableKey } = getSupabasePublicConfig();
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, authCookieOptions(options));
        });
      },
    },
  });

  await supabase.auth.getUser();
  return response;
}
