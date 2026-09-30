import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const port = 18080 + Math.floor(Math.random() * 1000);
const base = `http://localhost:${port}`;
let server;

before(async () => {
  server = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: String(port) }, stdio: "pipe" });
  await new Promise((resolve) => server.stdout.once("data", resolve));
});
after(() => server.kill());

test("every local file the page references is served", async () => {
  const html = readFileSync("public/index.html", "utf8");
  const refs = new Set([...html.matchAll(/\/(?:vendor|fonts|img)\/[\w.-]+|\/favicon\.svg/g)].map((m) => m[0]));
  assert.ok(refs.size > 20, `expected many local assets, found ${refs.size}`);
  for (const ref of refs) {
    const res = await fetch(base + ref);
    assert.equal(res.status, 200, ref);
  }
});

test("index is served at /", async () => {
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<title>Site Plan Maker<\/title>/);
});

test("paths outside public/ are not served", async () => {
  for (const path of ["/../package.json", "/%2e%2e/package.json", "/..%2fserver.js"]) {
    const res = await fetch(base + path);
    assert.notEqual(res.status, 200, path);
  }
});
