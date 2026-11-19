import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  // Friendly-setup guard: a deployment without the required Supabase env would
  // otherwise 500 inside the session refresh. Send the visitor to /setup, which
  // explains exactly which values to add (names only, never values).
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = "";
    return Response.redirect(url, 307);
  }

  return updateSupabaseSession(request);
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/signup",
    "/patient/:path*",
    "/doctor/:path*",
    "/front-desk/:path*",
    "/pharmacy/:path*",
    "/lab/:path*",
    "/provider-admin/:path*",
    "/admin/:path*",
  ],
};
