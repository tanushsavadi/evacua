// Verify a11y fixes: axe scan + suggestion-refresh 400 check + skip link.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.EVACUA_TEST_BASE ?? "http://localhost:3100";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
const page = await context.newPage();

const badResponses = [];
page.on("response", (res) => {
  if (res.status() >= 400 && res.url().includes("/api/") && !res.url().includes("open-meteo")) {
    badResponses.push(`${res.request().method()} ${new URL(res.url()).pathname} -> ${res.status()}`);
  }
});

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(2500);

// skip link: first tab stop should be the skip link
await page.keyboard.press("Tab");
const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
console.log(`first tab stop: "${first}" ${first === "Skip to command surface" ? "PASS" : "FAIL"}`);

// trigger a live brief so the suggestions effect refires with real (long) brief text
const textarea = page.locator("textarea").first();
await textarea.fill("give me a status brief on pine ridge");
await textarea.press("Enter");
await page.waitForTimeout(15000);

const axe = await new AxeBuilder({ page }).analyze();
console.log(`axe violations: ${axe.violations.length} ${axe.violations.length === 0 ? "PASS" : "FAIL"}`);
for (const v of axe.violations) console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);

console.log(`4xx/5xx API responses during session: ${badResponses.length} ${badResponses.length === 0 ? "PASS" : "FAIL"}`);
[...new Set(badResponses)].forEach((r) => console.log(`  - ${r}`));

// transcript log region present
const log = await page.locator("[role='log'][aria-live='polite']").count();
console.log(`aria-live transcript log: ${log >= 1 ? "PASS" : "FAIL"}`);

await browser.close();
