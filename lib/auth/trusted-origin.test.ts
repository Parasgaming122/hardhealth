import { afterEach, describe, expect, it } from "vitest";
import { requestAppOriginCandidatesFromHeaders, trustedAppOriginFrom } from "./trusted-origin";

const env = process.env as Record<string, string | undefined>;
const originalEnv = {
  siteUrl: env.NEXT_PUBLIC_SITE_URL,
  vercelUrl: env.VERCEL_URL,
  branchUrl: env.VERCEL_BRANCH_URL,
  nodeEnv: env.NODE_ENV,
};

afterEach(() => {
  if (originalEnv.siteUrl === undefined) delete env.NEXT_PUBLIC_SITE_URL; else env.NEXT_PUBLIC_SITE_URL = originalEnv.siteUrl;
  if (originalEnv.vercelUrl === undefined) delete env.VERCEL_URL; else env.VERCEL_URL = originalEnv.vercelUrl;
  if (originalEnv.branchUrl === undefined) delete env.VERCEL_BRANCH_URL; else env.VERCEL_BRANCH_URL = originalEnv.branchUrl;
  if (originalEnv.nodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = originalEnv.nodeEnv;
});

function headerBag(entries: Record<string, string>) {
  return (name: string) => entries[name.toLowerCase()] ?? null;
}

describe("trusted application redirect origins", () => {
  it("allows the configured Vercel domain and the exact Vercel deployment host", () => {
    env.NODE_ENV = "production";
    env.VERCEL_URL = "hard-health-records-preview-123.vercel.app";
    expect(trustedAppOriginFrom("https://hard-health-records.vercel.app")).toBe("https://hard-health-records.vercel.app");
    expect(trustedAppOriginFrom("https://hard-health-records-preview-123.vercel.app")).toBe("https://hard-health-records-preview-123.vercel.app");
    expect(trustedAppOriginFrom("https://hard-health-records-preview-456.vercel.app")).toBeNull();
  });

  it("accepts local HTTP only outside production and rejects open redirects", () => {
    env.NODE_ENV = "development";
    expect(trustedAppOriginFrom("http://localhost:3000")).toBe("http://localhost:3000");
    expect(trustedAppOriginFrom("http://localhost:3001")).toBeNull();
    expect(trustedAppOriginFrom("https://evil.example")).toBeNull();
    expect(trustedAppOriginFrom("javascript:alert(1)")).toBeNull();
    expect(trustedAppOriginFrom("https://hard-health-records.vercel.app.attacker.example")).toBeNull();
    expect(trustedAppOriginFrom("https://hard-health-records.vercel.app/path")).toBeNull();
  });

  it("normalizes a configured public site URL but requires an exact browser origin", () => {
    env.NODE_ENV = "production";
    env.NEXT_PUBLIC_SITE_URL = "https://preview.hard-health.example/";
    expect(trustedAppOriginFrom("https://preview.hard-health.example")).toBe("https://preview.hard-health.example");
    expect(trustedAppOriginFrom(" https://preview.hard-health.example")).toBeNull();
  });

  it("accepts any origin that matches the origin the request actually arrived on (deployment fix)", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PUBLIC_SITE_URL;
    delete env.VERCEL_URL;
    delete env.VERCEL_BRANCH_URL;
    // A fresh deployment host that is in no allowlist still works when the
    // server-verified request origin matches what the browser submitted.
    expect(trustedAppOriginFrom("https://hard-health.onrender.com", "https://hard-health.onrender.com")).toBe("https://hard-health.onrender.com");
    expect(trustedAppOriginFrom("https://custom-domain.example.pk", "https://custom-domain.example.pk")).toBe("https://custom-domain.example.pk");
    // Loopback is allowed when the request genuinely arrived on loopback
    // (operator running a production build locally).
    expect(trustedAppOriginFrom("http://localhost:3000", "http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("rejects a submitted origin that differs from the request origin", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PUBLIC_SITE_URL;
    delete env.VERCEL_URL;
    delete env.VERCEL_BRANCH_URL;
    // Spoofed origin in the form body must not be trusted.
    expect(trustedAppOriginFrom("https://evil.example", "https://hard-health.onrender.com")).toBeNull();
    expect(trustedAppOriginFrom("http://localhost:3000", "https://hard-health.onrender.com")).toBeNull();
    // Unrelated third origin must not be trusted either.
    expect(trustedAppOriginFrom("https://hard-health.onrender.com", "https://other.example")).toBeNull();
    // Malformed request-origin fallback must not grant anything.
    expect(trustedAppOriginFrom("https://hard-health.onrender.com", "not-a-url")).toBeNull();
    expect(trustedAppOriginFrom("https://hard-health.onrender.com", null)).toBeNull();
  });

  it("derives the request origin from forwarded headers and fails closed on malformed input", () => {
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "https" }))).toEqual(["https://app.example.com"]);
    // Host header fallback when no x-forwarded-host exists (direct connection):
    // both protocols become candidates since nothing proves which one was used.
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ host: "app.example.com" }))).toEqual(["https://app.example.com", "http://app.example.com"]);
    // Local dev proxy: forwarded host with port + http proto.
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "localhost:3000", "x-forwarded-proto": "http" }))).toEqual(["http://localhost:3000"]);
    // Multiple proxy hops: only the first entry is used.
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "app.example.com, internal.proxy", "x-forwarded-proto": "https,http" }))).toEqual(["https://app.example.com"]);
    // Malformed host / proto values fail closed (no candidates at all).
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "bad host with spaces" }))).toEqual([]);
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "app.example.com", "x-forwarded-proto": "not a proto" }))).toEqual([]);
    expect(requestAppOriginCandidatesFromHeaders(headerBag({}))).toEqual([]);
    // A path smuggled into the forwarded host never survives (exactOrigin requires a bare origin).
    expect(requestAppOriginCandidatesFromHeaders(headerBag({ "x-forwarded-host": "app.example.com/evil" }))).toEqual([]);
  });

  it("accepts a direct-connection (no proxy) origin via the dual-protocol fallback", () => {
    env.NODE_ENV = "production";
    delete env.NEXT_PUBLIC_SITE_URL;
    delete env.VERCEL_URL;
    delete env.VERCEL_BRANCH_URL;
    // A local production build with no reverse proxy: x-forwarded-* absent,
    // host header only. The browser's http origin must be accepted.
    expect(trustedAppOriginFrom("http://localhost:3000", ["https://localhost:3000", "http://localhost:3000"])).toBe("http://localhost:3000");
    // But the same fallback must not vouch for a DIFFERENT host.
    expect(trustedAppOriginFrom("http://evil.example", ["https://localhost:3000", "http://localhost:3000"])).toBeNull();
  });
});
