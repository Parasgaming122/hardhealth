// S14: measure real initial-load network transfers for key routes against a
// running production server, and (mobile mode) capture Android-viewport
// screenshots + horizontal-overflow diagnostics.
//
// Usage: node scripts/measure_initial_load.mjs <baseURL> [--mobile] [--shots dir]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const EXEC =
  process.env.CHROMIUM_PATH ||
  "/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome";
const BASE = process.argv[2] || "http://127.0.0.1:3000";
const MOBILE = process.argv.includes("--mobile");
const SHOTS = process.argv.includes("--shots")
  ? process.argv[process.argv.indexOf("--shots") + 1]
  : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const routes = ["/", "/login", "/demo", "/rx/resolve"];

const browser = await chromium.launch({
  headless: true,
  executablePath: EXEC,
  args: ["--no-sandbox"],
});

for (const route of routes) {
  const ctx = await browser.newContext(
    MOBILE
      ? {
          viewport: { width: 393, height: 851 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
          userAgent:
            "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        }
      : { viewport: { width: 1280, height: 800 } }
  );
  const page = await ctx.newPage();
  const sizes = new Map();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  cdp.on("Network.responseReceived", (e) => {
    sizes.set(e.requestId, { url: e.response.url, type: e.type, bytes: 0 });
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = sizes.get(e.requestId);
    if (r) r.bytes = e.encodedDataLength;
  });
  // Isolate the initial load: abort router prefetch requests only.
  await page.route("**/*", (r) => {
    const h = r.request().headers();
    if (h["next-router-prefetch"]) return r.abort();
    return r.continue();
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));

  await page.goto(BASE + route, { waitUntil: "load" });
  await page.waitForTimeout(1200);

  const rows = [...sizes.values()].filter((r) => r.bytes > 0);
  const js = rows.filter((r) => r.type === "Script").reduce((a, r) => a + r.bytes, 0);
  const css = rows.filter((r) => r.type === "Stylesheet").reduce((a, r) => a + r.bytes, 0);
  const total = js + css;

  const result = { mode: MOBILE ? "mobile" : "desktop", route, js, css, total, requests: rows.length, errors };
  if (MOBILE) {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));
    result.overflow = overflow.scrollWidth > overflow.clientWidth;
    result.overflowPx = overflow.scrollWidth - overflow.clientWidth;
    if (SHOTS) {
      const name = route === "/" ? "home" : route.slice(1).replace(/\//g, "-");
      await page.screenshot({ path: `${SHOTS}/${name}-mobile.jpg`, type: "jpeg", quality: 60, fullPage: false });
    }
  }
  console.log(JSON.stringify(result));
  await ctx.close();
}
await browser.close();
