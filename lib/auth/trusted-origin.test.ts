import { afterEach, describe, expect, it } from "vitest";
import { trustedAppOriginFrom } from "./trusted-origin";

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
});
