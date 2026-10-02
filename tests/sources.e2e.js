// Browser tests for the GTA/GGH sources (public/sources.js): where-am-I detection, local
// layer lists, source resolution (item → service → layer), Esri JSON fallback, parcel pick
// outside Toronto, failure notices and the /check.html page. All services are faked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const port = 20080 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const FAKE = "https://services.example.com/arcgis/rest/services";
// a square around the app's default map centre (Toronto City Hall), in [lng, lat]
const SQ = [[-79.3842, 43.6526], [-79.3822, 43.6526], [-79.3822, 43.6538], [-79.3842, 43.6538], [-79.3842, 43.6526]];

let server, browser, ctx;
const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

async function fakes(context) {
  await context.route(/^https?:\/\/(?!localhost)/, (route) => {
    const u = new URL(route.request().url());
    const p = u.pathname;
    // where-am-I: Ontario boundaries say Mississauga / Peel / Credit Valley
    if (/LIO_Open03\/MapServer\/14\/query/.test(p)) return json(route, { features: [{ attributes: { OBJECTID: 1, MUNICIPAL_NAME_SHORTFORM: "Mississauga", OFFICIAL_MUNICIPAL_NAME: "City of Mississauga" } }] });
    if (/LIO_Open03\/MapServer\/13\/query/.test(p)) return json(route, { features: [{ attributes: { OBJECTID: 2, OFFICIAL_MUNICIPAL_NAME: "The Regional Municipality of Peel" } }] });
    if (/LIO_Open03\/MapServer\/11\/query/.test(p)) return json(route, { features: [{ attributes: { OBJECTID: 3, NAME: "Credit Valley Conservation Authority" } }] });
    if (/LIO_Open03\/MapServer\/1[134]$/.test(p)) return json(route, { type: "Feature Layer", geometryType: "esriGeometryPolygon", displayField: "NAME", maxRecordCount: 1000, supportedQueryFormats: "JSON, geoJSON" });
    // ArcGIS Online items: Mississauga OP and parcels resolve to fake feature services
    if (/content\/items\/af2caaeb20a542fd871a5abcdf1834cb$/.test(p)) return json(route, { type: "Feature Service", title: "Official Plan Schedule 10", owner: "mississauga_gis", url: FAKE + "/OP/FeatureServer" });
    if (/content\/items\/df04a22833c9403fbb9f323de84956be$/.test(p)) return json(route, { type: "Feature Service", title: "Parcels", owner: "mississauga_gis", url: FAKE + "/Parcels/FeatureServer" });
    if (/content\/items\//.test(p)) return json(route, { error: { code: 400, message: "Item does not exist or is inaccessible." } });
    if (/sharing\/rest\/search/.test(p)) return json(route, { results: [] });
    // fake services
    if (p.endsWith("/OP/FeatureServer")) return json(route, { layers: [{ id: 0, name: "Schedule 10" }] });
    if (p.endsWith("/Parcels/FeatureServer")) return json(route, { layers: [{ id: 0, name: "Parcels" }] });
    if (/\/(OP|Parcels)\/FeatureServer\/0$/.test(p)) return json(route, { type: "Feature Layer", geometryType: "esriGeometryPolygon", displayField: "DESIGNATION", maxRecordCount: 2000, supportedQueryFormats: "JSON, geoJSON" });
    if (/\/(OP|Parcels)\/FeatureServer\/0\/query$/.test(p)) {
      return json(route, { type: "FeatureCollection", features: [{ type: "Feature", properties: { OBJECTID: 7, DESIGNATION: "Downtown Mixed Use" }, geometry: { type: "Polygon", coordinates: [SQ] } }] });
    }
    // CVC regulation limit: an older server with no GeoJSON; answers in Esri JSON
    if (/Generic_Regulations_Limit_2025\/FeatureServer\/0$/.test(p)) return json(route, { type: "Feature Layer", geometryType: "esriGeometryPolygon", displayField: "REG_TYPE", maxRecordCount: 1000, supportedQueryFormats: "JSON" });
    if (/Generic_Regulations_Limit_2025\/FeatureServer\/0\/query$/.test(p)) {
      if (u.searchParams.get("f") !== "json") return json(route, { error: { code: 400, message: "Invalid format" } });
      return json(route, { features: [{ attributes: { REG_TYPE: "Regulated area" }, geometry: { rings: [SQ] } }] });
    }
    if (/\.(png|jpe?g)|\/tile\//.test(p)) return route.fulfill({ contentType: "image/png", body: PNG });
    return route.fulfill({ status: 404, body: "" });
  });
}

before(async () => {
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  await new Promise((resolve) => server.stdout.once("data", resolve));
  browser = await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  await fakes(ctx);
});

after(async () => {
  await browser?.close();
  server?.kill();
});

test("detects the municipality and lists only its layers, with Ontario layers always", async () => {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/");
  await page.waitForTimeout(3500);
  await page.locator('button[data-pane="data"]').click();
  await page.waitForTimeout(300);
  assert.ok(await page.getByText("Local · Mississauga").count(), "local heading names the municipality");
  const local = await page.locator('button[data-ov^="mi"], button[data-ov^="ca"], button[data-ov^="oa"]').evaluateAll((els) => els.map((e) => e.dataset.ov));
  assert.ok(local.includes("miOp") && local.includes("miParcels"), "Mississauga layers listed: " + local);
  assert.ok(local.includes("caCvc"), "Credit Valley layer listed");
  assert.ok(!local.includes("oaZoning") && !local.includes("caTrca"), "other areas not listed: " + local);
  assert.equal(await page.locator('button[data-ov="pvOrm"]').count(), 1, "Ontario layers listed");

  // an item-based layer resolves and labels features from the layer's display field
  await page.locator('button[data-ov="miOp"]').click();
  await page.waitForTimeout(2000);
  const paths = page.locator("path.leaflet-interactive");
  assert.ok((await paths.count()) > 0, "OP polygon drawn");
  await paths.last().hover({ force: true });
  await page.waitForTimeout(400);
  assert.ok((await page.locator(".leaflet-tooltip").allInnerTexts()).some((t) => t.includes("Downtown Mixed Use")), "label from display field");
  assert.match(await page.getByText(/Not a plan of survey/).first().innerText(), /City of Mississauga/);

  // a server without GeoJSON still draws (Esri JSON converted)
  const before = await paths.count();
  await page.locator('button[data-ov="caCvc"]').click();
  await page.waitForTimeout(2000);
  assert.ok((await paths.count()) > before, "CVC polygon drawn from Esri JSON");

  // a source that can't be resolved says so once, and the rest keep working
  await page.locator('button[data-ov="miZoning"]').click();
  await page.waitForTimeout(2000);
  assert.match(await page.locator("#spm-notice").innerText(), /Zoning.*couldn’t load/);
  assert.ok((await paths.count()) >= before + 1, "other layers still drawn");
  assert.deepEqual(errors, []);
  await page.close();
});

test("parcel pick uses the municipality's parcel layer outside Toronto", async () => {
  const page = await ctx.newPage();
  await page.goto(base + "/");
  await page.waitForTimeout(3500);
  const bb = await page.locator(".leaflet-container").first().boundingBox();
  await page.keyboard.press("p");
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(1500);
  const area = await page.locator("[data-sheet-page]").first().getByText(/^site area$/i).first().locator("xpath=..").innerText();
  assert.match(area, /m²|ha/, "site area from the Mississauga parcel: " + area);
  await page.close();
});

test("check page runs every source and reports each one", async () => {
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/check.html");
  await page.getByRole("button", { name: "Run checks" }).click();
  await page.waitForFunction(() => /sources load from this browser/.test(document.getElementById("sum").textContent), null, { timeout: 120000 });
  const status = (k) => page.locator(`#r-${k} td`).first().innerText();
  assert.equal(await status("miOp"), "loads");
  assert.equal(await status("caCvc"), "loads");
  assert.equal(await status("where-muni"), "loads");
  assert.equal(await status("miZoning"), "fails");
  assert.ok(await page.getByText("Where-am-I test: Mississauga (Square One)").count());
  // Copy results: the whole table as tab-separated text, one source per line
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
  await page.getByRole("button", { name: "Copy results" }).click();
  await page.getByRole("button", { name: "Copied ✓" }).waitFor();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(text, /^Site Plan Maker data source check/);
  assert.match(text, /sources load from this browser/);
  assert.match(text, /\nloads\tOfficial Plan land use\tmississauga\t/);
  assert.match(text, /\nfails\tZoning\tmississauga\t/);
  assert.match(text, /Where-am-I test: Mississauga \(Square One\)/);
  assert.deepEqual(errors, []);
  await page.close();
});
