const primaryVercelOrigin = "https://hard-health-records.vercel.app";

function exactOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.username || url.password || (url.protocol !== "https:" && url.protocol !== "http:")) return null;
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function configuredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const candidate = value.includes("://") ? value : `https://${value}`;
  return exactOrigin(candidate);
}

function isLoopback(origin: string) {
  const hostname = new URL(origin).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

export type HeaderReader = (name: string) => string | null | undefined;

function firstHeaderValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first || null;
}

const PROTOCOL_PATTERN = /^[a-z][a-z0-9+.-]*$/i;

/**
 * Derives the origin(s) the current HTTP request can be proven to have arrived
 * on, from proxy-forwarded headers (`x-forwarded-host` / `x-forwarded-proto`,
 * falling back to `host`). Proxies may comma-join multiple hops — only the
 * first (client-most) entry is used. When `x-forwarded-proto` is absent (a
 * direct connection with no reverse proxy, e.g. a local production build),
 * both `https` and `http` variants of the host are returned as candidates and
 * the caller requires an exact string match, so nothing outside the request's
 * own host is ever accepted. Returns an empty list when headers are
 * absent/malformed, so callers fail closed.
 */
export function requestAppOriginCandidatesFromHeaders(header: HeaderReader): string[] {
  const forwardedHost = firstHeaderValue(header("x-forwarded-host")) ?? firstHeaderValue(header("host"));
  if (!forwardedHost) return [];

  const protoHeader = firstHeaderValue(header("x-forwarded-proto"));
  const protocols = protoHeader
    ? protoHeader.split(",").map((proto) => proto.trim()).filter((proto) => PROTOCOL_PATTERN.test(proto))
    : ["https", "http"];

  const candidates = new Set<string>();
  for (const protocol of protocols) {
    const origin = exactOrigin(`${protocol}://${forwardedHost}`);
    if (origin) candidates.add(origin);
  }
  return [...candidates];
}

/**
 * Validates a browser-submitted origin for auth redirects (email confirmation,
 * OAuth callback). An origin is trusted when EITHER
 *
 *  1. it exactly matches the origin this request arrived on (server-verified
 *     from forwarded headers) — redirecting back to the site the visitor is
 *     already on is inherently safe, and it makes every deployment (custom
 *     domain, preview URL, new host) work without env changes; Supabase's own
 *     redirect allowlist remains the outer gate; OR
 *  2. it is in the configured allowlist: the canonical Vercel production
 *     origin, `NEXT_PUBLIC_SITE_URL`, the active `VERCEL_URL` /
 *     `VERCEL_BRANCH_URL`, and localhost (development only).
 */
export function trustedAppOriginFrom(
  value: string | null | undefined,
  requestOrigins?: string | string[] | null,
): string | null {
  if (!value || value.length > 512 || value.trim() !== value) return null;
  const origin = exactOrigin(value);
  if (!origin || origin !== value) return null;

  const candidates = Array.isArray(requestOrigins)
    ? requestOrigins
    : requestOrigins
      ? [requestOrigins]
      : [];
  const verifiedRequestOrigins = candidates
    .map((candidate) => exactOrigin(candidate))
    .filter((candidate): candidate is string => Boolean(candidate));
  if (verifiedRequestOrigins.includes(origin)) return origin;

  if (process.env.NODE_ENV === "production" && isLoopback(origin)) return null;

  const configured = [
    configuredOrigin(process.env.NEXT_PUBLIC_SITE_URL),
    configuredOrigin(process.env.VERCEL_URL),
    configuredOrigin(process.env.VERCEL_BRANCH_URL),
  ].filter((item): item is string => Boolean(item));
  const trusted = new Set([primaryVercelOrigin, ...configured]);

  if (process.env.NODE_ENV !== "production") {
    trusted.add("http://localhost:3000");
    trusted.add("http://127.0.0.1:3000");
  }
  return trusted.has(origin) ? origin : null;
}
