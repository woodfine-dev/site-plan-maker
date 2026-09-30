// Browser tests: the built page in Chromium, with every outside service (tiles, Overpass,
// Toronto GIS, Nominatim) answered by fakes so results don't depend on the network.
// Run with `npm run test:e2e` (needs `npx playwright install chromium` once).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const port = 19080 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const LOGO = "public/img/16fd042e.png";
// two parcels, B overlapping the east half of A: the assembly is 1.5x one parcel
const A = [[-79.384, 43.6528], [-79.383, 43.6528], [-79.383, 43.6536], [-79.384, 43.6536], [-79.384, 43.6528]];
const B = [[-79.3835, 43.6528], [-79.3825, 43.6528], [-79.3825, 43.6536], [-79.3835, 43.6536], [-79.3835, 43.6528]];
const XSS = '<img src=x onerror="window.__xss=1">';

let server, browser, ctx, page, errors, overpassCalls, parcelCalls;

async function fakeNetwork(context) {
  await context.route(/^https?:\/\/(?!localhost)/, (route) => {
    const u = route.request().url();
    if (/interpreter/.test(u)) {
      overpassCalls++;
      const q = decodeURIComponent(u.split("data=")[1] || "");
      const elements = /nwr\[/.test(q)
        ? [{ type: "node", lat: 43.6533, lon: -79.3833, tags: { name: XSS, amenity: "school" } }]
        : [{ type: "way", tags: { highway: "primary", name: "Queen St" }, geometry: [{ lat: 43.652, lon: -79.39 }, { lat: 43.652, lon: -79.37 }] }];
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ elements }) });
    }
    if (/MapServer\/36\/query/.test(u)) {
      const ring = parcelCalls++ % 2 ? B : A;
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] }) });
    }
    if (/\.(png|jpe?g)|\/tile\//.test(u)) return route.fulfill({ contentType: "image/png", body: PNG });
    return route.fulfill({ status: 404, body: "" });
  });
}

const sheet = () => page.locator("[data-sheet-page]").first();
const areaText = async () => (await sheet().getByText(/^site area$/i).first().locator("xpath=..").innerText()).replace(/\s+/g, " ");
const hectares = (s) => {
  const m = s.match(/([\d.,]+) (ha|m²)/);
  return m ? parseFloat(m[1].replace(/,/g, "")) / (m[2] === "ha" ? 1 : 10000) : NaN;
};
const tabs = () => page.getByTitle("Click to switch · double-click to rename");
async function mapCentre() {
  const bb = await page.locator(".leaflet-container").first().boundingBox();
  return { cx: bb.x + bb.width / 2, cy: bb.y + bb.height / 2, bb };
}

before(async () => {
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  await new Promise((resolve) => server.stdout.once("data", resolve));
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  await fakeNetwork(ctx);
  page = await ctx.newPage();
  errors = [];
  overpassCalls = 0;
  parcelCalls = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/");
  await page.waitForTimeout(2500);
});

after(async () => {
  await browser?.close();
  server?.kill();
});

test("site area of an assembly is the union, and survives panning", async () => {
  const { cx, cy } = await mapCentre();
  await page.keyboard.press("p");
  await page.mouse.click(cx - 60, cy);
  await page.waitForTimeout(800);
  const one = hectares(await areaText());
  await page.keyboard.press("p");
  await page.keyboard.down("Shift");
  await page.mouse.click(cx + 60, cy);
  await page.keyboard.up("Shift");
  await page.waitForTimeout(800);
  const both = hectares(await areaText());
  assert.ok(Math.abs(both / one - 1.5) < 0.03, `assembly ${both} ha vs one parcel ${one} ha`);
  await page.keyboard.press("v");
  await page.mouse.move(cx, cy + 150);
  await page.mouse.down();
  await page.mouse.move(cx + 80, cy + 120, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(1200);
  assert.equal(hectares(await areaText()), both);
});

test("sheet credits name OpenStreetMap and Esri", async () => {
  const credit = await page.getByText(/Not a plan of survey/).first().innerText();
  assert.match(credit, /OpenStreetMap contributors/);
  assert.match(credit, /Powered by Esri/);
});

test("scale is exact at a preset, marked ≈ at free zoom, and in feet for imperial", async () => {
  await page.getByRole("button", { name: "1:2000" }).click();
  await page.waitForTimeout(900);
  assert.ok((await sheet().getByText(/^1:2,000$/).count()) > 0);
  const { cx, cy } = await mapCentre();
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(1200);
  assert.ok((await sheet().getByText(/^≈ 1:/).count()) > 0);
  await page.getByText("Units", { exact: true }).click();
  await page.waitForTimeout(600);
  assert.match(await sheet().getByText(/^0 – /).first().innerText(), / ft| mi/);
  await page.getByText("Units", { exact: true }).click();
});

test("names from OpenStreetMap are shown as text, never run as HTML", async () => {
  await page.locator('button[data-pane="data"]').click();
  await page.locator('button[data-ov="poiSchool"]').first().click();
  await page.waitForTimeout(2500);
  const marks = page.locator(".leaflet-marker-icon");
  for (let i = 0; i < (await marks.count()); i++) await marks.nth(i).hover({ timeout: 1000, force: true }).catch(() => {});
  await page.waitForTimeout(500);
  const tips = await page.locator(".leaflet-tooltip").allInnerTexts();
  assert.ok(tips.some((t) => t.includes("<img")), "tooltip shows the name as text: " + JSON.stringify(tips));
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  await page.locator('button[data-ov="poiSchool"]').first().click();
  await page.locator('button[data-pane="sheet"]').click();
});

test("small pans reuse the key plan", async () => {
  await page.waitForTimeout(2500);
  const before = overpassCalls;
  const { cx, cy } = await mapCentre();
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 25, cy, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(1500);
  }
  // one street-label query per pan; no key-plan rebuilds
  assert.ok(overpassCalls - before <= 3, `${overpassCalls - before} Overpass calls`);
});

test("undo never reaches into another plan tab", async () => {
  await page.getByTitle("Open a new, independent plan").click();
  await page.waitForTimeout(1500);
  const { bb } = await mapCentre();
  await page.keyboard.press("b");
  for (const [dx, dy] of [[0.4, 0.4], [0.6, 0.4], [0.6, 0.6]]) await page.mouse.click(bb.x + bb.width * dx, bb.y + bb.height * dy);
  await page.keyboard.press("Enter");
  await page.keyboard.press("v");
  await page.waitForTimeout(600);
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Control+z");
    await page.waitForTimeout(300);
  }
  assert.match(await areaText(), /—/);
});

test("backup holds every plan with its logo, and import opens new tabs", async () => {
  await tabs().first().click();
  await page.waitForTimeout(1500);
  const slot = page.locator("image-slot").first();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), slot.click()]);
  await chooser.setFiles(LOGO);
  await page.waitForTimeout(1500);
  await page.locator('button[data-pane="file"]').click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByText("Back up all plans").click()]);
  const file = join(tmpdir(), `spm-backup-${port}.json`);
  await dl.saveAs(file);
  const backup = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(backup.plans.length, 2);
  assert.equal(Object.keys(backup.plans[0].logos).length, 1);
  const before = await tabs().count();
  const [chooser2] = await Promise.all([page.waitForEvent("filechooser"), page.getByText("Import", { exact: true }).click()]);
  await chooser2.setFiles(file);
  await page.waitForTimeout(2500);
  assert.equal(await tabs().count(), before + 2);
  assert.ok(await page.locator("image-slot").first().evaluate((el) => el.hasAttribute("data-filled")), "imported logo shows");
  assert.ok(hectares(await areaText()) > 1, "imported plan keeps its site");
});

test("a save that doesn't fit shows a warning, which clears on the next good save", async () => {
  await page.evaluate(() => {
    window.__fill = [];
    let size = 1024 * 1024, i = 0;
    while (size >= 16) {
      try { localStorage.setItem("fill" + i, "x".repeat(size)); window.__fill.push(i); i++; } catch (e) { size = Math.floor(size / 2); }
    }
  });
  await page.locator('button[data-pane="sheet"]').click();
  // a text note bigger than what's left, even once the key-plan cache is dropped
  const { cx, cy } = await mapCentre();
  await page.keyboard.press("t");
  await page.mouse.click(cx + 100, cy + 100);
  await page.waitForTimeout(400);
  await page.keyboard.insertText("Note ".repeat(400));
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#spm-save-warn").count(), 1);
  await page.evaluate(() => window.__fill.forEach((i) => localStorage.removeItem("fill" + i)));
  await page.getByText("Units", { exact: true }).click();
  await page.waitForTimeout(1500);
  assert.equal(await page.locator("#spm-save-warn").count(), 0);
});

test("PDF export still works", async () => {
  const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByText("Export PDF (11×17)").first().click()]);
  assert.match(pdf.suggestedFilename(), /\.pdf$/);
});

test("no script errors on the page", () => {
  assert.deepEqual(errors, []);
});

test("old saves: shared logos become per-plan, and an unreadable plan is kept aside", async () => {
  const p = await ctx.newPage();
  const png = "data:image/png;base64," + readFileSync(LOGO).toString("base64");
  await p.goto(base + "/favicon.svg");
  await p.evaluate((png) => {
    localStorage.clear();
    localStorage.setItem("spm-docs-v1", JSON.stringify({ v: 1, docs: [{ id: "d1", name: "Plan 1" }, { id: "dx", name: "Plan 2" }], docId: "dx" }));
    localStorage.setItem("site-plan-maker:image-slots", JSON.stringify({ "logo-s1": png }));
    localStorage.setItem("spm-doc-dx", "{not json");
  }, png);
  await p.goto(base + "/");
  await p.waitForTimeout(2500);
  assert.deepEqual((await p.evaluate(() => window.imageSlots.keys())).sort(), ["logo-d1-s1", "logo-dx-s1"]);
  assert.ok(await p.locator("image-slot").first().evaluate((el) => el.hasAttribute("data-filled")));
  assert.equal((await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("spm-doc-dx-unreadable-")))).length, 1);
  assert.equal(await p.locator("#spm-notice").count(), 1);
  await p.close();
});
