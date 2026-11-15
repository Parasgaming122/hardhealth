import assert from "node:assert/strict";
import { test } from "node:test";
import { chromium } from "playwright-core";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const executablePath = process.env.CHROMIUM_PATH;

async function launchBrowser() {
  return chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
}

async function openDemoRole(page, roleLabel, expectedHeading) {
  await page.goto(`${baseURL}/demo`);
  const rolePicker = page.getByRole("button", { name: /switch role|select role|change role/i });
  if (await rolePicker.count()) {
    await rolePicker.first().click();
  }
  const roleOption = page.getByRole("button", { name: new RegExp(roleLabel, "i") });
  if (await roleOption.count()) await roleOption.first().click();
  await page.getByText(expectedHeading, { exact: false }).first().waitFor({ state: "visible", timeout: 8000 });
}

test("public home links to Patient signup and signup enforces patient-only language", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await page.getByRole("link", { name: /create a patient account/i }).waitFor();
    await page.goto(`${baseURL}/signup`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /create your account/i }).waitFor();
    assert.equal(await page.getByLabel("Full name").count(), 1);
    assert.equal(await page.getByLabel("Email").count(), 1);
    assert.equal(await page.getByLabel("Password", { exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /continue with google/i }).count(), 1);
    assert.equal(await page.locator("select[name='role'], input[name='role']").count(), 0);
    assert.match(await page.locator("body").innerText(), /other roles require a H\.A\.R\.D administrator/i);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("login and OAuth callback fail closed with fixed messaging for unconfigured Google", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(`${baseURL}/login?error=google`, { waitUntil: "networkidle" });
    await page.getByRole("alert").getByText(/Google sign-in is not ready/i).waitFor();
    await page.getByRole("link", { name: /create a patient account/i }).waitFor();
    const response = await page.goto(`${baseURL}/auth/callback`);
    assert.equal(response?.status(), 303);
    assert.equal(response?.headers().location, "/login?error=google");
  } finally {
    await browser.close();
  }
});

test("fictional role switcher opens the key workspaces and mobile Patient menu exposes all sections", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${baseURL}/demo`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /your care, accounted for/i }).waitFor();
    const mobileNav = page.getByRole("navigation", { name: /mobile workspace navigation/i });
    assert.equal(await mobileNav.getByRole("button").count(), 8);
    for (const label of ["Overview", "Timeline", "Prescriptions", "Reports", "Expenses", "Providers & Access", "Billing", "Settings"]) {
      assert.equal(await mobileNav.getByRole("button", { name: label }).count(), 1);
    }
    assert.equal(await page.getByRole("button", { name: /notifications/i }).count(), 1);
    assert.equal(await page.getByRole("button", { name: /exit demo/i }).count(), 1);
  } finally {
    await browser.close();
  }
});
