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

export function trustedAppOriginFrom(value: string | null | undefined): string | null {
  if (!value || value.length > 512 || value.trim() !== value) return null;
  const origin = exactOrigin(value);
  if (!origin || origin !== value || (process.env.NODE_ENV === "production" && isLoopback(origin))) return null;

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
