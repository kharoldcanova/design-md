#!/usr/bin/env node
/**
 * Smoke suite for design_md_previewer.html (Playwright + Chromium).
 *
 *   node verify/smoke.mjs
 *
 * The previewer is a single file with no build step, so the suite drives the
 * real UI in a browser and asserts on the document the tool actually writes.
 *
 * Environment:
 *   PLAYWRIGHT_MODULE  path to the playwright package (auto-detected otherwise)
 *   CHROMIUM_PATH      chromium binary (default: /usr/bin/chromium)
 */

import { existsSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const APP = resolve(HERE, "..", "assets", "design_md_previewer.html");

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

/* ------------------------------------------------------------------- helpers */

/** Extracts `{ light, dark }` hexes for a token row of the dual table. */
function tokenColumns(md, token) {
  const rows = md.split(/\r?\n/).filter((l) => l.trim().startsWith("|"));
  const headerIdx = rows.findIndex(
    (l) => /light|claro/i.test(l) && /dark|oscuro/i.test(l) && /hex|valor|c[óo]digo/i.test(l),
  );
  if (headerIdx < 0) return null;
  const header = rows[headerIdx].split("|").map((c) => c.trim());
  const lightCol = header.findIndex((c) => /light|claro/i.test(c) && /hex|valor/i.test(c));
  const darkCol = header.findIndex((c) => /dark|oscuro/i.test(c) && /hex|valor/i.test(c));
  for (const line of rows.slice(headerIdx + 1)) {
    const cells = line.split("|").map((c) => c.trim());
    const name = (cells.find((c) => /^`?--/.test(c)) || "").replace(/`/g, "");
    if (name !== token) continue;
    const pick = (i) => {
      const m = /^`?(#[0-9a-fA-F]{3,8})`?$/.exec(cells[i] || "");
      return m ? m[1].toUpperCase() : null;
    };
    return { light: pick(lightCol), dark: pick(darkCol) };
  }
  return null;
}

const hexOf = (h) => {
  const s = (h || "").replace("#", "");
  const n = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const lum = (h) => {
  const [r, g, b] = hexOf(h).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

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
/* La herramienta pide confirmación al reemplazar un documento con cambios:
   el suite acepta siempre para poder recorrer el flujo completo. */
const dialogs = [];
page.on("dialog", (d) => {
  dialogs.push(d.message());
  d.accept();
});

const APP_URL = pathToFileURL(APP).href;
const md = () => page.evaluate(() => document.getElementById("source").value);
const toastText = () => page.evaluate(() => document.getElementById("toast").textContent.trim());
const reload = async () => {
  await page.goto(APP_URL);
  await page.waitForFunction(() => !!window.DesignMdPreviewer);
  await page.waitForTimeout(120);
};
/* Recarga sin estado guardado: la pantalla de inicio solo aparece la primera
   vez, cuando no hay documento en localStorage. */
const fresh = async () => {
  await page.evaluate(() => localStorage.clear());
  await reload();
};
const openSample = async () => {
  await page.click('[data-door="sample"]');
  await page.waitForTimeout(200);
};

console.log(`\ndesign_md_previewer.html — ${APP}\n`);

/* --- shell ---------------------------------------------------------------- */
await reload();

await test("la app carga y expone su API pública", async () => {
  const ok = await page.evaluate(() => !!window.DesignMdPreviewer && !!window.DesignMdPreviewer.state);
  assert(ok, "window.DesignMdPreviewer no está disponible");
});

await test("la pantalla de inicio ofrece las tres puertas", async () => {
  const doors = await page.$$eval("[data-door]", (els) => els.map((e) => e.dataset.door));
  assert(doors.includes("zero") && doors.includes("open") && doors.includes("sample"),
    `puertas encontradas: ${doors.join(", ")}`);
});

await test("la plantilla canónica es el documento inicial", async () => {
  const text = await md();
  assert(text.startsWith("# DESIGN.md - Sistema de Diseño Universal"),
    "el documento inicial no es la plantilla universal");
});

/* --- example document ----------------------------------------------------- */
await openSample();

await test("«Ver un ejemplo» carga el documento universal con dos columnas", async () => {
  const text = await md();
  assert(text.includes("# DESIGN.md - Sistema de Diseño Universal"), "falta el H1 universal");
  assert(/Valor Hex\s*\|\s*Light/i.test(text) || /Light/i.test(text), "falta la columna Light");
  assert(/Dark/i.test(text), "falta la columna Dark");
  assert(text.includes("aurora") === false, "el nombre del proyecto no debe filtrarse al H1 universal");
});

await test("el documento de ejemplo no deja marcadores sin rellenar", async () => {
  const text = await md();
  const placeholders = [...text.matchAll(/\[([^\]\n]{3,160})\](?!\()/g)].map((m) => m[1]);
  assert(placeholders.length === 0, `marcadores sin rellenar: ${placeholders.join(", ")}`);
});

await test("la página de ejemplo se renderiza con el documento cargado", async () => {
  const canvases = await page.$$eval("#preview .pv-canvas", (els) => els.length);
  assert(canvases >= 1, "no hay lienzo renderizado en #preview");
});

/* --- steps ---------------------------------------------------------------- */
await test("los cinco pasos son accesibles y el lienzo nunca desaparece", async () => {
  for (const step of [1, 2, 3, 4, 5]) {
    await page.click(`.step-tab[data-step="${step}"]`);
    await page.waitForTimeout(80);
    const visible = await page.isVisible(`#step-${step}`);
    assert(visible, `el paso ${step} no se muestra`);
    const rail = await page.isVisible("#canvasRail");
    assert(rail, `el lienzo desaparece en el paso ${step}`);
    const painted = await page.$$eval("#preview .pv-canvas", (els) => els.length);
    assert(painted >= 1, `el lienzo está vacío en el paso ${step}`);
  }
});

/* --- scenarios, theme, device --------------------------------------------- */
await test("cambiar de escenario repinta la página de ejemplo", async () => {
  await page.click('.step-tab[data-step="1"]');
  const landing = await page.$eval("#preview", (el) => el.innerHTML);
  await page.click('#scenarioSeg button[data-scenario="dashboard"]');
  await page.waitForTimeout(120);
  const dashboard = await page.$eval("#preview", (el) => el.innerHTML);
  assert(landing !== dashboard, "el escenario Dashboard no cambió el render");
  await page.click('#scenarioSeg button[data-scenario="landing"]');
});

await test("el tema Dual muestra las dos columnas a la vez", async () => {
  await page.click('#themeSeg button[data-theme="Dual"]');
  await page.waitForTimeout(150);
  const canvases = await page.$$eval("#preview .pv-canvas", (els) => els.length);
  assert(canvases >= 2, `Dual debería renderizar dos lienzos, encontré ${canvases}`);
  await page.click('#themeSeg button[data-theme="Claro"]');
});

await test("el tamaño móvil cambia el lienzo", async () => {
  const desktop = await page.$eval("#preview", (el) => el.innerHTML);
  await page.click('#deviceSeg button[data-device="mobile"]');
  await page.waitForTimeout(120);
  const mobile = await page.$eval("#preview", (el) => el.innerHTML);
  assert(desktop !== mobile, "el modo móvil no cambió el render");
  await page.click('#deviceSeg button[data-device="desktop"]');
});

/* --- health ---------------------------------------------------------------- */
await test("el panel de salud informa de forma objetiva", async () => {
  await page.click("#btnHealth");
  await page.waitForTimeout(120);
  assert(await page.isVisible("#healthPanel"), "el panel de salud no se abre");
  const body = await page.$eval("#healthBody", (el) => el.innerText.trim());
  assert(body.length > 0, "el panel de salud está vacío");
  const score = await page.$eval("#healthScore", (el) => el.textContent.trim());
  assert(score.length > 0, "no hay puntuación de salud");
});

/* --- document step --------------------------------------------------------- */
await test("el documento se muestra en solo lectura y se puede editar a mano", async () => {
  await page.click('.step-tab[data-step="5"]');
  await page.waitForTimeout(120);
  const view = await page.$eval("#docView", (el) => el.innerText);
  assert(view.includes("DESIGN.md - Sistema de Diseño Universal"), "la vista del documento está vacía");
  assert(await page.isHidden("#mdEditWrap"), "el textarea de edición debería estar oculto");
  await page.click('#docModeSeg button[data-docmode="edit"]');
  await page.waitForTimeout(100);
  assert(await page.isVisible("#mdEditWrap"), "el modo edición no muestra el textarea");
  await page.click('#docModeSeg button[data-docmode="view"]');
});

await test("el diff informa de los cambios respecto al documento abierto", async () => {
  await page.click('.step-tab[data-step="2"]');
  await page.waitForTimeout(100);
  await page.fill('#pasteColor', "AF4D98");
  await page.click("#btnPalette");
  await page.waitForTimeout(250);
  const summary = await page.$eval("#diffSummary", (el) => el.textContent.trim());
  assert(summary.length > 0, "el resumen del diff está vacío");
  const diffBody = await page.$eval("#diffBody", (el) => el.innerText);
  assert(diffBody.length > 0, "el diff no muestra diferencias");
});

/* --- palette generation ---------------------------------------------------- */
await test("«Generar paleta» deriva un sistema claro/oscuro desde un color de coolors.co", async () => {
  const before = await md();
  const beforeAccent = tokenColumns(before, "--primary");
  await page.fill("#pasteColor", "1E88E5");
  await page.click("#btnPalette");
  await page.waitForTimeout(300);
  const after = await md();
  const accent = tokenColumns(after, "--primary");
  const canvas = tokenColumns(after, "--bg-base");
  assert(accent && accent.light && accent.dark, "la paleta no escribió las dos columnas");
  assert(accent.light !== accent.dark, "las columnas claro/oscuro quedaron iguales");
  assert(canvas && canvas.light && canvas.dark, "falta el fondo en una columna");
  assert(JSON.stringify(accent) !== JSON.stringify(beforeAccent), "el acento no cambió");
  const hint = await toastText();
  assert(/paleta/i.test(hint), `el aviso no explica la paleta: "${hint}"`);
});

await test("el texto principal mantiene contraste AA en las dos columnas", async () => {
  const text = await md();
  const t = tokenColumns(text, "--text-primary");
  const base = tokenColumns(text, "--bg-base");
  const surface = tokenColumns(text, "--bg-surface");
  for (const mode of ["light", "dark"]) {
    const c1 = contrast(t[mode], base[mode]);
    assert(c1 >= 4.5, `texto principal sobre fondo (${mode}): ${c1.toFixed(2)}:1`);
    if (surface && surface[mode]) {
      const c2 = contrast(t[mode], surface[mode]);
      assert(c2 >= 4.5, `texto principal sobre superficie (${mode}): ${c2.toFixed(2)}:1`);
    }
  }
});

await test("deshacer devuelve el documento anterior", async () => {
  const before = await md();
  await page.fill("#pasteColor", "4B3F72");
  await page.click("#btnPalette");
  await page.waitForTimeout(250);
  const changed = await md();
  assert(changed !== before, "la paleta no cambió el documento");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  const undone = await md();
  assert(undone === before, "Ctrl+Z no restauró el documento anterior");
});

await test("una lista de coolors.co genera la paleta a partir de varios colores", async () => {
  await page.fill("#pasteColor", "AF4D98, 4B3F72");
  await page.click("#btnPalette");
  await page.waitForTimeout(300);
  const hint = await toastText();
  assert(/2 colores/i.test(hint), `el aviso no cuenta los colores: "${hint}"`);
});

await test("un enlace de coolors.co se reconoce como paleta", async () => {
  const before = await md();
  await page.fill("#pasteColor", "https://coolors.co/af4d98-4b3f72");
  await page.click("#btnPalette");
  await page.waitForTimeout(300);
  const hint = await toastText();
  assert(/paleta/i.test(hint), `el enlace de coolors.co no se importó: "${hint}"`);
  const after = await md();
  assert(after.length > 0 && before.length > 0, "el documento quedó vacío");
});

await test("un texto sin color explica el formato esperado y no rompe nada", async () => {
  const before = await md();
  await page.fill("#pasteColor", "esto no es un color");
  await page.click("#btnPalette");
  await page.waitForTimeout(250);
  const hint = await toastText();
  assert(/no se encontr[oó]/i.test(hint), `el aviso no explica el formato: "${hint}"`);
  const after = await md();
  assert(after === before, "el documento cambió con una entrada inválida");
});

await test("«Aplicar al rol» escribe el color en las dos columnas", async () => {
  const before = await md();
  const beforeCanvas = tokenColumns(before, "--bg-base");
  await page.selectOption("#pasteTarget", "canvas");
  await page.fill("#pasteColor", "0xFF102030");
  await page.click("#btnPasteColor");
  await page.waitForTimeout(300);
  const after = await md();
  const canvas = tokenColumns(after, "--bg-base");
  assert(canvas.light !== beforeCanvas.light || canvas.dark !== beforeCanvas.dark,
    "el rol no se aplicó al documento");
});

/* --- exports --------------------------------------------------------------- */
await test("las exportaciones CSS, JSON y Tailwind se generan", async () => {
  await page.click('.step-tab[data-step="5"]');
  await page.waitForTimeout(120);
  const exports = await page.evaluate(() => {
    const { state, buildTheme, exportCss, exportJson } = window.DesignMdPreviewer;
    const theme = buildTheme(state.spec, state.overrides);
    return { css: exportCss(state.spec, theme), json: exportJson(state.spec, theme) };
  });
  assert(exports.css.includes("--bg-base") || exports.css.includes(":root"), "el CSS no trae las variables");
  assert(exports.json.length > 20, "el JSON está vacío");
  const body = await page.$eval("#exportsBody", (el) => el.textContent || "");
  assert(/tailwind\.config\.js/i.test(body), "no aparece la exportación de Tailwind");
  assert(/CSS custom properties/i.test(body), "no aparece la exportación de CSS");
});

/* --- presets --------------------------------------------------------------- */
await test("los estilos de la pantalla de inicio reescriben los tokens", async () => {
  await fresh();
  const before = await md();
  const preset = await page.$("#presetGrid .preset");
  assert(preset, "la pantalla de inicio no muestra estilos");
  await preset.click();
  await page.waitForTimeout(400);
  const after = await md();
  assert(after !== before, "el estilo no reescribió el documento");
  const accent = tokenColumns(after, "--primary");
  assert(accent && accent.light && accent.dark, "el estilo no dejó las dos columnas con color");
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  const undone = await md();
  assert(undone === before, "Ctrl+Z no restauró el documento tras un estilo");
});

/* --- console --------------------------------------------------------------- */
await test("no hay errores de consola durante todo el recorrido", async () => {
  assert(pageErrors.length === 0, `errores de página: ${pageErrors.join(" | ")}`);
  assert(consoleErrors.length === 0, `errores de consola: ${consoleErrors.join(" | ")}`);
});

/* --- checker parity -------------------------------------------------------- */
await test("el documento de ejemplo pasa el verificador de la skill design-md", async () => {
  const checker = resolve(HERE, "..", "assets", "check-design.mjs");
  if (!existsSync(checker)) return; // checker opcional
  await fresh();
  await openSample();
  const dir = mkdtempSync(join(tmpdir(), "designmd-verify-"));
  const file = join(dir, "DESIGN.md");
  writeFileSync(file, await md());
  try {
    execFileSync(process.execPath, [checker, file], { stdio: "pipe" });
  } catch (err) {
    throw new Error(`el verificador rechazó el documento: ${err.stdout || err.message}`);
  }
});

await browser.close();

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFallos:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed ? 1 : 0);
