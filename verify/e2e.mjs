#!/usr/bin/env node
/**
 * End-to-end suite for the `design-md` skill (Playwright + Chromium).
 *
 *   node verify/e2e.mjs
 *
 * This suite follows the SKILL.md flow literally, as an agent would:
 * start the session → open the browser → the user configures project, color
 * and typography → export → the checker audits the exported document.
 *
 * It answers one question the other suites do not: does the document that a
 * real user configuration produces pass `assets/check-design.mjs`?
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
const SKILL = resolve(HERE, "..");
const SESSION = join(SKILL, "assets", "designmd-session.mjs");
const CHECKER = join(SKILL, "assets", "check-design.mjs");

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

let passed = 0;
let failed = 0;
const failures = [];
const notes = [];

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

/* --- utilidades de documento ---------------------------------------------- */

/** Valor hex de la columna Light de una fila de token (`| \`--primary\` | \`#xxxxxx\` | …). */
function tokenLight(md, token) {
  const cells = tokenCells(md, token);
  const hex = (cells[2] || "").replace(/`/g, "");
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

/** Valor hex de la columna Dark de una fila de token. */
function tokenDark(md, token) {
  const cells = tokenCells(md, token);
  const hex = (cells[3] || "").replace(/`/g, "");
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
}

function tokenCells(md, token) {
  const line = md.split(/\r?\n/).find((l) => l.includes("`" + token + "`"));
  return line ? line.split("|").map((c) => c.trim()) : [];
}

function hue(hex) {
  const s = hex.replace("#", "");
  const r = parseInt(s.slice(0, 2), 16) / 255;
  const g = parseInt(s.slice(2, 4), 16) / 255;
  const b = parseInt(s.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (!d) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

function hueDistance(a, b) {
  const d = Math.abs(hue(a) - hue(b));
  return d > 180 ? 360 - d : d;
}

/* ------------------------------------------------- proyecto y sesión (SKILL.md) */

const root = mkdtempSync(join(tmpdir(), "designmd-e2e-"));
const project = join(root, "tienda");
mkdirSync(project, { recursive: true });
writeFileSync(join(project, "README.md"), "# Tienda\n\nProyecto de prueba.\n", "utf8");

/* Paso 2 de la skill: levantar la sesión y abrir el navegador. */
const start = execFileSync(process.execPath, [SESSION, "start", "--project", project, "--no-open"], { encoding: "utf8" });
const url = (start.match(/^URL=(.+)$/m) || [])[1];
assert(url, "la sesión no devolvió URL:\n" + start);

console.log(`\ndesign-md end-to-end — ${SKILL}\n`);

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
const goStep = async (n) => {
  await page.click(`.step-tab[data-step="${n}"]`);
  await wait(200);
};

await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => !!window.DesignMdPreviewer, null, { timeout: 10000 });

/* --- el usuario empieza desde la plantilla canónica ------------------------ */
await test("la pantalla de inicio deja empezar desde la plantilla", async () => {
  await page.click('[data-door="zero"]');
  await wait(300);
  const text = await md();
  assert(text.startsWith("# DESIGN.md - Sistema de Diseño Universal"), "la plantilla canónica no es el documento inicial");
});

/* --- paso 1: proyecto ------------------------------------------------------ */
await test("el nombre del proyecto se guarda en la herramienta, no en el H1", async () => {
  await goStep(1);
  await page.click('[data-toggle="meta:name"]');
  await page.fill('input[data-meta="name"]', "Tienda Aurora");
  await page.locator('input[data-meta="name"]').press("Tab");
  await wait(300);
  const text = await md();
  assert(text.startsWith("# DESIGN.md - Sistema de Diseño Universal"), "el H1 universal fue sobrescrito");
  const name = await page.evaluate(() => (window.DesignMdPreviewer.state.overrides.meta || {}).name);
  assert(name === "Tienda Aurora", `el nombre del proyecto no se guardó: ${name}`);
});

await test("el concepto y la filosofía rellenan la sección 1 sin placeholders", async () => {
  await page.click('[data-toggle="meta:concept"]');
  await page.selectOption('select[data-concept="1"]', "sereno");
  await wait(250);
  await page.click('[data-toggle="philosophy"]');
  await page.selectOption('select[data-philosophy="1"]', "editorial");
  await wait(350);
  const text = await md();
  assert(!/\[Ej: Minimalista/.test(text), "la Estética Core sigue con su marcador");
  assert(!/\[Descripción breve/.test(text), "el Propósito sigue con su marcador");
});

/* --- paso 2: color --------------------------------------------------------- */
await test("«Generar paleta» aplica el color semilla elegido por el usuario", async () => {
  await goStep(2);
  await page.fill("#pasteColor", "AF4D98");
  await page.click("#btnPalette");
  await wait(500);
  const text = await md();
  const primary = tokenLight(text, "--primary");
  assert(primary, "el documento no tiene una fila --primary con valor hex");
  assert(primary !== "#2563EB", "el acento no cambió respecto a la plantilla");
  assert(
    hueDistance(primary, "#AF4D98") <= 25,
    `el color semilla no se respetó: --primary ${primary} frente a #AF4D98`,
  );
  const dark = tokenDark(text, "--primary");
  assert(dark, "la columna Dark del acento no tiene un hex válido");
});

/* --- paso 3: tipografía ---------------------------------------------------- */
await test("la familia tipográfica principal se escribe en el documento", async () => {
  await goStep(3);
  await page.click('[data-toggle="typo:primary"]');
  await page.fill('input[data-font="primary"]', "Inter");
  await page.locator('input[data-font="primary"]').press("Tab");
  await wait(400);
  const text = await md();
  assert(/Inter/.test(text), "la familia tipográfica no llegó al documento");
});

/* --- paso 5: exportar ------------------------------------------------------ */
await test("«Guardar en el proyecto» deja el DESIGN.md en la raíz del proyecto", async () => {
  await goStep(5);
  await page.click("#btnSaveProject");
  const target = join(project, "DESIGN.md");
  for (let i = 0; i < 80 && !existsSync(target); i++) await wait(100);
  assert(existsSync(target), "el DESIGN.md no llegó al proyecto");
  const text = readFileSync(target, "utf8");
  assert(text === (await md()), "el archivo no coincide con el documento de la herramienta");
});

/* --- paso 5 de la skill: verificar con el checker -------------------------- */
let checkerOutput = "";
await test("el checker de la skill acepta el documento exportado (0 FAIL)", async () => {
  const target = join(project, "DESIGN.md");
  try {
    checkerOutput = execFileSync(process.execPath, [CHECKER, target], { encoding: "utf8" });
  } catch (err) {
    checkerOutput = (err.stdout || "") + (err.stderr || "");
    throw new Error(`el checker rechazó el documento exportado:\n${checkerOutput}`);
  }
  assert(!/^FAIL/m.test(checkerOutput), `el checker reportó FAIL:\n${checkerOutput}`);
  const warns = checkerOutput.split("\n").filter((l) => l.startsWith("WARN"));
  notes.push(`WARN del checker sobre el documento exportado: ${warns.length}`);
  for (const w of warns) notes.push(`  ${w}`);
});

await test("el documento exportado no deja marcadores sin rellenar", async () => {
  const text = readFileSync(join(project, "DESIGN.md"), "utf8");
  const placeholders = text.match(/\[[^\]\n]{6,}\]/g) || [];
  assert(placeholders.length === 0, `quedaron marcadores: ${placeholders.join(", ")}`);
});

await test("el documento exportado conserva la estructura canónica", async () => {
  const text = readFileSync(join(project, "DESIGN.md"), "utf8");
  for (const needle of [
    "# DESIGN.md - Sistema de Diseño Universal",
    "## 1. Visión y Filosofía del Producto",
    "## 2. Design Tokens",
    "## 3. Componentes Base y Estados Obligatorios",
    "## 4. Guías de Implementación para la IA",
    "Valor Hex / Light",
    "Valor Hex / Dark",
    "radius-full",
  ]) {
    assert(text.includes(needle), `falta la parte canónica: ${needle}`);
  }
});

await test("no hay errores de consola durante todo el recorrido", async () => {
  assert(pageErrors.length === 0, `errores de página: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `errores de consola: ${consoleErrors.join(" | ")}`);
});

await browser.close();
try {
  execFileSync(process.execPath, [SESSION, "stop", "--project", project], { stdio: "pipe" });
} catch {
  /* la sesión puede ya estar caída */
}
rmSync(root, { recursive: true, force: true });

console.log(`\n${passed} passed, ${failed} failed`);
if (notes.length) {
  console.log("\nNotas para el agente que entrega:");
  for (const n of notes) console.log("  " + n);
}
if (failures.length) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
