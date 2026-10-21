#!/usr/bin/env node
// Usage: node check-design.mjs [DESIGN.md]
// Audits a canonical DESIGN.md: palette table shape, placeholders, contrast.
// Exit 0 = all checks pass, 1 = at least one FAIL.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const allowPlaceholders = args.includes("--allow-placeholders");
const fileArg = args.find((a) => !a.startsWith("--"));
const file = resolve(fileArg ?? "DESIGN.md");
const md = readFileSync(file, "utf8");
const fails = [];
const warns = [];
let currentMode = "light";

const hexToRgb = (h) => {
  const s = h.replace("#", "");
  const n = s.length === 3 ? s.split("").map((c) => c + c).join("") : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const lin = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (n) => Math.round(n * 100) / 100;

// --- structure -------------------------------------------------------------
if (!/^#\s*DESIGN\.md\s*-\s*Sistema de Diseño Universal/m.test(md)) {
  fails.push("H1 must be `# DESIGN.md - Sistema de Diseño Universal`");
}
const sections = ["1. Visión y Filosofía", "2. Design Tokens", "3. Componentes Base", "4. Guías de Implementación"];
for (const s of sections) {
  if (!new RegExp(`^##\\s*${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m").test(md)) {
    fails.push(`missing section: ## ${s}`);
  }
}
if (!/\*\*Instrucción para la IA:\*\*/.test(md)) fails.push("missing AI instruction blockquote");
const states = ["Default", "Hover", "Active", "Focus", "Disabled"];
for (const s of states) {
  if (!new RegExp(`\\*\\*${s}`, "i").test(md)) fails.push(`missing component state: ${s}`);
}
for (const n of [1, 2, 3, 4]) {
  if (!new RegExp(`\\*\\*Regla ${n}`).test(md)) warns.push(`missing Regla ${n}`);
}
if (!allowPlaceholders) {
  // Bracketed text that is NOT a markdown link/image target, e.g. `[Ej: Minimalista]`.
  const placeholders = [...md.matchAll(/\[([^\]\n]{3,160})\](?!\()/g)]
    .map((m) => m[1].trim())
    .filter((t) => t.length > 0);
  if (placeholders.length) {
    fails.push(`unresolved placeholders: ${placeholders.map((p) => `[${p}]`).join(" ")}`);
  }
}

// --- palette table ---------------------------------------------------------
const rows = md.split(/\r?\n/).filter((l) => /^\|/.test(l.trim()));
const headerIdx = rows.findIndex(
  (l) => /light|claro/i.test(l) && /dark|oscuro/i.test(l) && /hex|valor|c[óo]digo/i.test(l),
);
if (headerIdx < 0) fail("no dual `Valor Hex / Light` + `Valor Hex / Dark` header row");
const header = headerIdx < 0 ? [] : rows[headerIdx].split("|").map((c) => c.trim());
const lightCol = header.findIndex((c) => /light|claro/i.test(c) && /hex|valor/i.test(c));
const darkCol = header.findIndex((c) => /dark|oscuro/i.test(c) && /hex|valor/i.test(c));
const tokens = {};
for (const line of headerIdx < 0 ? [] : rows.slice(headerIdx + 1)) {
  if (/^[|\s:-]+$/.test(line)) continue;
  const cells = line.split("|").map((c) => c.trim());
  const name = (cells.find((c) => /^`?--/.test(c)) || "").replace(/`/g, "");
  if (!name) continue;
  const pick = (i) => {
    const m = /^`?(#[0-9a-fA-F]{3,8})`?$/.exec(cells[i] ?? "");
    return m ? m[1].toUpperCase() : null;
  };
  const light = pick(lightCol);
  const dark = pick(darkCol);
  if (!light || !dark) fails.push(`${name}: both columns need a #hex value (light=${light} dark=${dark})`);
  else tokens[name] = { light, dark };
}
const required = [
  "--bg-base", "--bg-surface", "--bg-elevated", "--text-primary", "--text-secondary",
  "--primary", "--accent", "--success", "--warning", "--error", "--border",
];
for (const t of required) if (!tokens[t]) fails.push(`missing token: ${t}`);

function fail(msg) {
  fails.push(msg);
}
if (Object.keys(tokens).length && !fails.some((f) => f.startsWith("missing token"))) {
  const check = (label, a, b, min, hard = true) => {
    if (!a || !b) return;
    const v = r2(ratio(a, b));
    if (v < min) (hard ? fails : warns).push(`${label} [${currentMode}]: ${v}:1 < ${min}:1`);
    else console.log(`  ok  ${v.toFixed(2)}:1  ${label}`);
  };
  for (const mode of ["light", "dark"]) {
    currentMode = mode;
    console.log(`\n${mode.toUpperCase()}`);
    const t = (n) => tokens[n]?.[mode];
    check("text-primary on bg-base", t("--text-primary"), t("--bg-base"), 4.5);
    check("text-primary on bg-surface", t("--text-primary"), t("--bg-surface"), 4.5);
    check("text-secondary on bg-base", t("--text-secondary"), t("--bg-base"), 4.5);
    check("error as message text on bg-base", t("--error"), t("--bg-base"), 4.5);
    check("primary as link text on bg-base", t("--primary"), t("--bg-base"), 4.5);
    // accent and status colors are usually highlights or fills, not body text
    check("accent as text on bg-base", t("--accent"), t("--bg-base"), 4.5, false);
    check("text-secondary on bg-surface", t("--text-secondary"), t("--bg-surface"), 4.5, false);
    for (const tok of ["--success", "--warning"]) {
      check(`${tok} as text on bg-base`, t(tok), t("--bg-base"), 4.5, false);
    }
    // fill label: white or near-black must pass on each action/status color
    for (const tok of ["--primary", "--accent", "--success", "--warning", "--error"]) {
      const bg = t(tok);
      if (!bg) continue;
      const white = ratio(bg, "#FFFFFF");
      const ink = ratio(bg, "#09090B");
      const best = r2(Math.max(white, ink));
      const who = white >= ink ? "white" : "#09090B";
      if (best < 4.5) fails.push(`${tok} fill label (${who}): ${best}:1 < 4.5:1`);
      else console.log(`  ok  ${best.toFixed(2)}:1  ${tok} with ${who} label`);
    }
    const borderRatio = r2(ratio(t("--border"), t("--bg-base")));
    if (borderRatio < 1.25) warns.push(`--border vs --bg-base (${mode}): ${borderRatio}:1, likely invisible`);
    else console.log(`  ok  ${borderRatio.toFixed(2)}:1  --border on --bg-base (visible)`);
    const step = r2(ratio(t("--bg-surface"), t("--bg-base")));
    if (step < 1.03) warns.push(`--bg-surface vs --bg-base (${mode}): ${step}:1, surfaces not distinguishable`);
  }
}

// --- report ----------------------------------------------------------------
console.log(`\n${file}: ${Object.keys(tokens).length} tokens`);
for (const w of warns) console.log(`WARN  ${w}`);
for (const f of fails) console.log(`FAIL  ${f}`);
console.log(fails.length ? `\n${fails.length} failure(s)` : "\nPASS");
process.exit(fails.length ? 1 : 0);
