#!/usr/bin/env node
/**
 * Smoke suite for the design-md browser session (Playwright + Chromium).
 *
 *   node verify/session.mjs
 *
 * The session server serves the previewer and adds a "Guardar en el proyecto"
 * button. This suite drives the real UI in a browser and asserts that the
 * document the user exports lands in the project directory.
 *
 * Environment:
 *   PLAYWRIGHT_MODULE  path to the playwright package (auto-detected otherwise)
 *   CHROMIUM_PATH      chromium binary (default: /usr/bin/chromium)
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const SESSION = resolve(HERE, "..", "assets", "designmd-session.mjs");

function loadPlaywright() {
  const candidates = [];
  if (process.env.PLAYWRIGHT_MODULE) candidates.push(process.env.PLAYWRIGHT_MODULE);
  candidates.push("playwright");
  const npxRoot = join(process.env.HOME || "", ".npm", "_npx");
  if (existsSync(npxRoot)) {
    for (const dir of readdirSync(npxRoot)) {
      candidates.push(join(npxRoot, dir, "node_modules", "playwright"));
    }
  }
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error("playwright not found. Set PLAYWRIGHT_MODULE to the package directory.");
}

/* ------------------------------------------------------------------ harness */

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- session */

function startSession(project) {
  const out = execFileSync(process.execPath, [SESSION, "start", "--project", project, "--no-open"], {
    encoding: "utf8",
  });
  const url = (out.match(/^URL=(.+)$/m) || [])[1];
  if (!url) throw new Error("la sesión no devolvió URL:\n" + out);
  return url;
}

function stopSession(project) {
  try {
    execFileSync(process.execPath, [SESSION, "stop", "--project", project], { stdio: "pipe" });
  } catch {
    /* la sesión puede ya estar caída */
  }
}

const root = mkdtempSync(join(tmpdir(), "designmd-session-"));
const projectA = join(root, "proyecto-a");
const projectB = join(root, "proyecto-b");
mkdirSync(projectA, { recursive: true });
mkdirSync(projectB, { recursive: true });

const EXISTING =
  "# DESIGN.md - Sistema de Diseño Universal\n\n## 1. Visión y Filosofía del Producto\n* **Propósito:** Proyecto que ya existía.\n";
writeFileSync(join(projectB, "DESIGN.md"), EXISTING, "utf8");

let urlA = "";
let urlB = "";
try {
  urlA = startSession(projectA);
  urlB = startSession(projectB);
} catch (err) {
  console.error("no se pudo levantar la sesión:", err.message);
  process.exit(1);
}

console.log(`\ndesignmd-session.mjs — ${SESSION}\n`);

/* --------------------------------------------------------------------- main */

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const consoleErrors = [];
const pageErrors = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("dialog", (d) => d.accept());

const md = () => page.evaluate(() => document.getElementById("source").value);
const overlayHidden = () =>
  page.evaluate(() => {
    const el = document.getElementById("startScreen");
    return !el || el.hidden === true;
  });

await page.goto(urlA, { waitUntil: "load" });
await page.waitForFunction(() => !!window.DesignMdPreviewer, null, { timeout: 10000 });

await test("la sesión sirve el previewer con el botón «Guardar en el proyecto»", async () => {
  const btn = await page.$("#btnSaveProject");
  assert(btn, "no se montó el botón #btnSaveProject en la barra superior");
  const title = await btn.getAttribute("title");
  assert(title && title.includes(join(projectA, "DESIGN.md")), `el título del botón no apunta al destino: ${title}`);
});

await test("el overlay de bienvenida se cierra y deja ver la herramienta", async () => {
  await page.click('[data-door="close"]');
  await wait(150);
  assert(await overlayHidden(), "el overlay de bienvenida sigue visible");
});

await test("el destino se muestra junto al documento", async () => {
  await page.click('[data-step="5"]');
  await page.waitForSelector("#designmdTarget", { timeout: 5000 });
  const note = await page.textContent("#designmdTarget");
  assert(note.includes(join(projectA, "DESIGN.md")), `la nota no muestra el destino: ${note}`);
});

await test("exportar desde el navegador escribe el DESIGN.md en el proyecto", async () => {
  const text = await md();
  assert(text.trim().length > 0, "el documento del previewer está vacío");
  await page.click("#btnSaveProject");
  const target = join(projectA, "DESIGN.md");
  for (let i = 0; i < 60 && !existsSync(target); i++) await wait(100);
  assert(existsSync(target), "el DESIGN.md no apareció en el proyecto");
  const saved = readFileSync(target, "utf8");
  assert(saved === text, "el archivo guardado no coincide con el documento del previewer");
});

await test("el botón confirma el guardado en la interfaz", async () => {
  await page
    .waitForFunction(() => /Guardado en/.test((document.getElementById("toast") || {}).textContent || ""), null, {
      timeout: 5000,
    })
    .catch(() => {});
  const toast = await page.textContent("#toast");
  assert(/Guardado en/.test(toast || ""), `el aviso no confirma el guardado: ${toast}`);
});

await test("el servidor informa el documento exportado", async () => {
  const out = execFileSync(process.execPath, [SESSION, "status", "--project", projectA], { encoding: "utf8" });
  const status = JSON.parse(out);
  assert(status.ok === true, "el estado de la sesión no es correcto");
  assert(status.saved && status.saved.path === join(projectA, "DESIGN.md"), "la sesión no registró la exportación");
  assert(status.file.exists === true, "el archivo no existe según la sesión");
});

await test("un proyecto con DESIGN.md existente abre su documento, no la plantilla", async () => {
  await page.goto(urlB, { waitUntil: "load" });
  await page.waitForFunction(() => (document.getElementById("source") || {}).value, null, { timeout: 10000 });
  const text = await md();
  assert(text.includes("Proyecto que ya existía"), "el documento existente no se cargó en el navegador");
  assert(await overlayHidden(), "el overlay de bienvenida tapa el documento ya existente");
});

await test("exportar reemplaza el DESIGN.md existente y deja constancia", async () => {
  const target = join(projectB, "DESIGN.md");
  await page.evaluate(() => {
    const ta = document.getElementById("source");
    ta.value = ta.value + "\n## Editado en el navegador\n";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.click("#btnSaveProject");
  for (let i = 0; i < 60; i++) {
    if (readFileSync(target, "utf8") !== EXISTING) break;
    await wait(100);
  }
  const now = readFileSync(target, "utf8");
  assert(now !== EXISTING, "el DESIGN.md existente no se reemplazó");
  assert(now.includes("Editado en el navegador"), "el cambio del navegador no llegó al archivo");
  const out = execFileSync(process.execPath, [SESSION, "status", "--project", projectB], { encoding: "utf8" });
  const status = JSON.parse(out);
  assert(status.saved.replaced === true, "la sesión no reportó el reemplazo");
});

await test("una petición sin token no puede escribir en el proyecto", async () => {
  const res = await fetch(urlA + "api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "# DESIGN.md - hack\n" }),
  });
  assert(res.status === 403, `la escritura sin token debería rechazarse: ${res.status}`);
  const content = readFileSync(join(projectA, "DESIGN.md"), "utf8");
  assert(!content.includes("hack"), "el archivo del proyecto se modificó sin token");
});

await test("no hay errores de consola durante todo el recorrido", async () => {
  assert(pageErrors.length === 0, `errores de página: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `errores de consola: ${consoleErrors.join(" | ")}`);
});

await browser.close();
stopSession(projectA);
stopSession(projectB);
rmSync(root, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
