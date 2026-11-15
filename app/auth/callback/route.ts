import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { homePathForRoles, type WorkspacePayload } from "@/lib/auth/roles";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/env";

function relativeRedirect(path: string) {
  const response = new NextResponse(null, { status: 303, headers: { "Cache-Control": "no-store" } });
  response.headers.set("Location", path);
  return response;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  if (!code || params.has("error")) return relativeRedirect("/login?error=google");

  let response = relativeRedirect("/access-pending");
  try {
    const { url, publishableKey } = getSupabasePublicConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, authCookieOptions(options));
          });
        },
      },
    });

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError || !sessionData.user) return relativeRedirect("/login?error=google");

    const { data, error } = await supabase.rpc("get_my_workspace");
    if (!error) {
      const destination = homePathForRoles((data as WorkspacePayload).roles);
      if (destination) response.headers.set("Location", destination);
    }
    return response;
  } catch {
    return relativeRedirect("/login?error=google");
  }
}
