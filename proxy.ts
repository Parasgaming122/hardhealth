import type { NextRequest } from "next/server";
import { updateSupabaseSession } from "@/lib/supabase/proxy";

export function proxy(request: NextRequest) {
  return updateSupabaseSession(request);
}

export const config = {
  matcher: ["/login", "/patient/:path*", "/doctor/:path*", "/front-desk/:path*", "/pharmacy/:path*", "/lab/:path*", "/provider-admin/:path*", "/admin/:path*"],
};
