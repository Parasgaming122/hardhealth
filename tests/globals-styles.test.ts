import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("global stylesheet integrity", () => {
  it("keeps Tailwind and the shared brand, dashboard, homepage and secure-workspace styles", () => {
    expect(stylesheet).toContain('@import "tailwindcss";');
    const brandMarkRule = stylesheet.match(/\.brand-mark\s*\{([^}]*)\}/);
    expect(brandMarkRule?.[1]).toContain("width: 38px");
    expect(stylesheet).toContain(".patient-overview-layout");
    expect(stylesheet).toContain(".hard-home");
    expect(stylesheet).toContain(".secure-auth-page");
    expect(stylesheet).toContain(".secure-primary");
  });
});
