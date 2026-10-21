#!/usr/bin/env node
/**
 * designmd-session.mjs — sesión de diseño en el navegador para la skill `design-md`.
 *
 *   node designmd-session.mjs start --project <dir> [--out DESIGN.md] [--port N] [--no-open]
 *   node designmd-session.mjs status [--project <dir>] [--wait <seg>]
 *   node designmd-session.mjs stop   [--project <dir>]
 *
 * `start` levanta un servidor local (127.0.0.1, puerto efímero) que sirve la
 * plantilla del previewer y le inyecta el botón «Guardar en el proyecto». Ese
 * botón escribe el DESIGN.md directamente en el directorio del proyecto, sin
 * pasar por Descargas. La escritura está restringida a ese directorio.
 *
 * `status` informa si el usuario ya exportó el documento (con `--wait` espera
 * hasta N segundos). `stop` apaga el servidor.
 *
 * Variables de entorno:
 *   DESIGNMD_PREVIEWER     ruta alternativa al previewer HTML
 *   DESIGNMD_RUNTIME_DIR   donde viven los archivos de sesión (por defecto /tmp/opencode)
 */

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PREVIEWER = join(HERE, "design_md_previewer.html");
const RUNTIME_DIR = process.env.DESIGNMD_RUNTIME_DIR || "/tmp/opencode";
const MAX_BODY = 2 * 1024 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/* --------------------------------------------------------------- utilidades */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[key] = true;
      else {
        out[key] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function die(msg, code = 1) {
  process.stderr.write("designmd-session: " + msg + "\n");
  process.exit(code);
}

function sessionFile(project) {
  const key = createHash("sha1").update(resolve(project)).digest("hex").slice(0, 12);
  return join(RUNTIME_DIR, `designmd-session-${key}.json`);
}

function readSession(project) {
  if (project) {
    const file = sessionFile(project);
    return existsSync(file) ? { file, data: JSON.parse(readFileSync(file, "utf8")) } : null;
  }
  let best = null;
  if (!existsSync(RUNTIME_DIR)) return null;
  for (const name of readdirSync(RUNTIME_DIR)) {
    if (!name.startsWith("designmd-session-") || !name.endsWith(".json")) continue;
    const file = join(RUNTIME_DIR, name);
    try {
      const data = JSON.parse(readFileSync(file, "utf8"));
      if (!best || data.startedAt > best.data.startedAt) best = { file, data };
    } catch {
      /* archivo corrupto: se ignora */
    }
  }
  return best;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function insideProject(project, target) {
  const root = resolve(project) + sep;
  return resolve(target).startsWith(root);
}

function openBrowser(url) {
  const candidates = ["xdg-open", "gio", "sensible-browser", "x-www-browser", "google-chrome", "chromium"];
  for (const bin of candidates) {
    try {
      const p = spawn(bin, bin === "gio" ? ["open", url] : [url], { stdio: "ignore", detached: true });
      p.on("error", () => {});
      p.unref();
      return bin;
    } catch {
      /* siguiente candidato */
    }
  }
  return null;
}

/* ------------------------------------------------------- bootstrap del cliente */

/**
 * Se inyecta en el HTML servido: monta el botón «Guardar en el proyecto»
 * y, si el proyecto ya tenía un DESIGN.md, lo carga para que el usuario
 * parta de su documento y no de la plantilla en blanco.
 */
function bootstrapScript(cfg) {
  return [
    "<script>",
    "(function(){",
    "var CFG = " + JSON.stringify(cfg) + ";",
    "function toastMsg(m){ try{ if (typeof toast === 'function') toast(m); }catch(e){} }",
    "function currentMd(){",
    "  var ta = document.getElementById('source');",
    "  if (ta && ta.value && ta.value.trim()) return ta.value;",
    "  var api = window.DesignMdPreviewer;",
    "  if (api && api.state && api.state.spec && api.state.spec.raw) return api.state.spec.raw;",
    "  return '';",
    "}",
    "function save(){",
    "  var md = currentMd();",
    "  if (!md || !md.trim()) { toastMsg('No hay documento que exportar'); return; }",
    "  fetch('/api/save', { method:'POST', headers:{'Content-Type':'application/json','X-Designmd-Token':CFG.token}, body: JSON.stringify({ content: md }) })",
    "    .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }, function(){ return { ok:false, j:{ error:'respuesta ilegible' } }; }); })",
    "    .then(function(res){ if (res.ok && res.j && res.j.ok) toastMsg('Guardado en ' + res.j.path); else toastMsg('No se pudo guardar: ' + ((res.j && res.j.error) || 'error desconocido')); })",
    "    .catch(function(e){ toastMsg('No se pudo guardar: ' + e.message); });",
    "}",
    "function mount(){",
    "  var top = document.querySelector('.topbar-actions');",
    "  var bar = document.querySelector('.doc-toolbar');",
    "  if (top && !document.getElementById('btnSaveProject')) {",
    "    var b = document.createElement('button');",
    "    b.className = 'btn btn-acid-dark';",
    "    b.id = 'btnSaveProject';",
    "    b.title = 'Guardar el documento en ' + CFG.target;",
    "    b.innerHTML = '<span>Guardar en el proyecto</span>';",
    "    b.addEventListener('click', save);",
    "    top.appendChild(b);",
    "  }",
    "  if (bar && !document.getElementById('btnSaveProjectDoc')) {",
    "    var b2 = document.createElement('button');",
    "    b2.className = 'btn btn-acid-dark';",
    "    b2.id = 'btnSaveProjectDoc';",
    "    b2.title = 'Guardar el documento en ' + CFG.target;",
    "    b2.innerHTML = '<span>Guardar en el proyecto</span>';",
    "    b2.addEventListener('click', save);",
    "    var dl = document.getElementById('btnDownloadMd');",
    "    if (dl && dl.parentNode) dl.parentNode.insertBefore(b2, dl.nextSibling); else bar.appendChild(b2);",
    "    var note = document.createElement('span');",
    "    note.className = 'diff-sum';",
    "    note.id = 'designmdTarget';",
    "    note.textContent = '→ ' + CFG.target;",
    "    bar.insertBefore(note, b2);",
    "  }",
    "}",
    "function bootstrap(){",
    "  if (CFG.initialMd && !CFG.booted) {",
    "    CFG.booted = true;",
    "    try {",
    "      if (typeof closeStart === 'function') closeStart();",
    "      if (typeof loadText === 'function') loadText(CFG.initialMd, CFG.initialName, true);",
    "    } catch(e){}",
    "  }",
    "  mount();",
    "}",
    "if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap); else bootstrap();",
    "window.addEventListener('load', function(){ setTimeout(bootstrap, 60); });",
    "})();",
    "</script>",
  ].join("\n");
}

function servedHtml(cfg, initialMd) {
  const raw = readFileSync(cfg.previewer, "utf8");
  const payload = {
    target: cfg.target,
    project: cfg.project,
    fileName: cfg.out,
    token: cfg.token,
    initialMd: initialMd || "",
    initialName: cfg.out,
  };
  const script = bootstrapScript(payload);
  const at = raw.lastIndexOf("</body>");
  if (at === -1) return raw + "\n" + script;
  return raw.slice(0, at) + script + "\n" + raw.slice(at);
}

/* ------------------------------------------------------------------ servidor */

function serve(cfg) {
  const initialPath = join(cfg.project, cfg.out);
  const initialMd = existsSync(initialPath) ? readFileSync(initialPath, "utf8") : "";
  cfg.token = randomBytes(16).toString("hex");

  let saved = null;
  let previous = null;

  /* Solo la página servida por esta sesión puede escribir: un portal cualquiera
     abierto en otra pestaña no debe poder tocar el DESIGN.md del proyecto. */
  const authorized = (req) => {
    const given = req.headers["x-designmd-token"];
    if (typeof given !== "string" || given.length !== cfg.token.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(cfg.token));
  };

  const server = createServer((req, res) => {
    const remote = req.socket.remoteAddress || "";
    if (!LOOPBACK.has(remote)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    const json = (code, body) => {
      res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };

    if (req.method === "GET" && pathname === "/favicon.ico") {
      res.writeHead(204).end();
      return;
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(servedHtml(cfg, initialMd));
      return;
    }

    if (req.method === "GET" && pathname === "/api/config") {
      json(200, { project: cfg.project, target: cfg.target, fileName: cfg.out, url: cfg.url });
      return;
    }

    if (req.method === "GET" && pathname === "/api/status") {
      let file = null;
      try {
        const st = statSync(cfg.target);
        file = { exists: true, bytes: st.size, mtime: st.mtime.toISOString() };
      } catch {
        file = { exists: false };
      }
      json(200, { ok: true, url: cfg.url, target: cfg.target, project: cfg.project, saved, file });
      return;
    }

    if (req.method === "GET" && pathname === "/api/previous") {
      if (!authorized(req)) return json(403, { ok: false, error: "token inválido" });
      json(200, { ok: true, previous });
      return;
    }

    if (req.method === "POST" && pathname === "/api/save") {
      if (!authorized(req)) return json(403, { ok: false, error: "token inválido" });
      let body = "";
      let tooBig = false;
      req.on("data", (c) => {
        body += c;
        if (body.length > MAX_BODY) {
          tooBig = true;
          req.destroy();
        }
      });
      req.on("end", () => {
        if (tooBig) return json(413, { ok: false, error: "documento demasiado grande" });
        let payload;
        try {
          payload = JSON.parse(body || "{}");
        } catch {
          return json(400, { ok: false, error: "JSON inválido" });
        }
        const content = typeof payload.content === "string" ? payload.content : "";
        if (!content.trim()) return json(400, { ok: false, error: "documento vacío" });
        const target = resolve(cfg.project, cfg.out);
        if (!insideProject(cfg.project, target)) return json(403, { ok: false, error: "destino fuera del proyecto" });

        const warnings = [];
        if (!/^#\s*DESIGN\.md/m.test(content)) warnings.push("El H1 no es `# DESIGN.md …`");

        let replaced = false;
        try {
          if (existsSync(target)) {
            replaced = true;
            previous = readFileSync(target, "utf8");
          }
        } catch {
          /* sin anterior */
        }

        const tmp = target + ".tmp-" + process.pid;
        try {
          writeFileSync(tmp, content, "utf8");
          renameSync(tmp, target);
        } catch (err) {
          try {
            rmSync(tmp, { force: true });
          } catch {
            /* nada que limpiar */
          }
          return json(500, { ok: false, error: "no se pudo escribir: " + err.message });
        }

        saved = { path: target, at: new Date().toISOString(), bytes: Buffer.byteLength(content, "utf8"), replaced, warnings };
        json(200, { ok: true, path: target, bytes: saved.bytes, at: saved.at, replaced, warnings });
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/stop") {
      if (!authorized(req)) return json(403, { ok: false, error: "token inválido" });
      json(200, { ok: true });
      setTimeout(() => {
        server.close();
        try {
          rmSync(cfg.sessionFile, { force: true });
        } catch {
          /* nada que limpiar */
        }
        process.exit(0);
      }, 50);
      return;
    }

    json(404, { ok: false, error: "ruta desconocida" });
  });

  server.listen(cfg.port, "127.0.0.1", () => {
    const addr = server.address();
    cfg.port = addr.port;
    cfg.url = `http://127.0.0.1:${cfg.port}/`;
    mkdirSync(RUNTIME_DIR, { recursive: true });
    writeFileSync(
      cfg.sessionFile,
      JSON.stringify(
        {
          pid: process.pid,
          port: cfg.port,
          url: cfg.url,
          token: cfg.token,
          project: cfg.project,
          out: cfg.out,
          target: cfg.target,
          previewer: cfg.previewer,
          startedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  });

  process.on("SIGTERM", () => {
    try {
      rmSync(cfg.sessionFile, { force: true });
    } catch {
      /* nada que limpiar */
    }
    process.exit(0);
  });
}

/* ------------------------------------------------------------------ comandos */

async function cmdStart(args) {
  const project = resolve(args.project || process.cwd());
  if (!existsSync(project)) die("el directorio del proyecto no existe: " + project);
  const out = typeof args.out === "string" ? args.out : "DESIGN.md";
  const previewer = resolve(
    typeof args.previewer === "string" ? args.previewer : process.env.DESIGNMD_PREVIEWER || DEFAULT_PREVIEWER,
  );
  if (!existsSync(previewer)) die("no se encuentra el previewer: " + previewer);

  const target = resolve(project, out);
  if (!insideProject(project, target)) die("el destino queda fuera del proyecto: " + target);

  // Si ya había una sesión para este proyecto, se apaga antes de abrir otra.
  const prev = readSession(project);
  if (prev && prev.data.pid && isAlive(prev.data.pid)) {
    try {
      process.kill(prev.data.pid, "SIGTERM");
    } catch {
      /* ya estaba muerta */
    }
    await sleep(200);
  }

  mkdirSync(RUNTIME_DIR, { recursive: true });
  const file = sessionFile(project);
  rmSync(file, { force: true });

  const port = typeof args.port === "string" ? Number(args.port) : 0;
  const child = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), "serve", "--project", project, "--out", out, "--previewer", previewer, "--port", String(port)],
    { detached: true, stdio: "ignore" },
  );
  child.on("error", () => {});
  child.unref();

  let data = null;
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (existsSync(file)) {
      try {
        data = JSON.parse(readFileSync(file, "utf8"));
        break;
      } catch {
        /* aún no está completo */
      }
    }
  }
  if (!data) die("el servidor no arrancó (revisa que el puerto esté libre)");

  const url = data.url;
  let opened = null;
  if (args["no-open"] !== true && args.open !== "false") opened = openBrowser(url);

  process.stdout.write(
    [
      `URL=${url}`,
      `TARGET=${data.target}`,
      `PROJECT=${data.project}`,
      `PREVIEWER=${data.previewer}`,
      `SESSION=${file}`,
      `BROWSER=${opened || "manual"}`,
      "",
    ].join("\n"),
  );
}

async function cmdStatus(args) {
  const session = readSession(args.project);
  if (!session) {
    process.stdout.write(JSON.stringify({ ok: false, error: "no hay sesión activa" }) + "\n");
    process.exit(2);
  }
  const { data } = session;
  const wait = typeof args.wait === "string" ? Number(args.wait) : 0;
  const deadline = Date.now() + wait * 1000;

  let status = null;
  for (;;) {
    try {
      const res = await fetch(data.url + "api/status");
      status = await res.json();
    } catch {
      status = null;
    }
    if (status && status.saved) break;
    if (!wait || Date.now() >= deadline) break;
    await sleep(1000);
  }

  const out = {
    ok: !!status,
    url: data.url,
    project: data.project,
    target: data.target,
    session: session.file,
    alive: isAlive(data.pid),
    saved: status ? status.saved : null,
    file: status ? status.file : null,
  };
  if (!status) out.error = "el servidor no responde";
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}

async function cmdStop(args) {
  const session = readSession(args.project);
  if (!session) {
    process.stdout.write(JSON.stringify({ ok: false, error: "no hay sesión activa" }) + "\n");
    process.exit(2);
  }
  const { data } = session;
  try {
    await fetch(data.url + "api/stop", { method: "POST", headers: { "X-Designmd-Token": data.token || "" } });
  } catch {
    /* el servidor puede ya estar caído: se mata por pid */
  }
  await sleep(200);
  if (isAlive(data.pid)) {
    try {
      process.kill(data.pid, "SIGTERM");
    } catch {
      /* ya estaba muerta */
    }
  }
  rmSync(session.file, { force: true });
  process.stdout.write(JSON.stringify({ ok: true, stopped: data.url }) + "\n");
}

/* ---------------------------------------------------------------------- main */

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || "start";

if (command === "serve") {
  const project = resolve(args.project || process.cwd());
  const out = typeof args.out === "string" ? args.out : "DESIGN.md";
  const previewer = resolve(
    typeof args.previewer === "string" ? args.previewer : process.env.DESIGNMD_PREVIEWER || DEFAULT_PREVIEWER,
  );
  serve({
    project,
    out,
    previewer,
    port: typeof args.port === "string" ? Number(args.port) : 0,
    target: resolve(project, out),
    url: "",
    sessionFile: sessionFile(project),
  });
} else if (command === "start") {
  await cmdStart(args);
} else if (command === "status") {
  await cmdStatus(args);
} else if (command === "stop") {
  await cmdStop(args);
} else {
  die("comando desconocido: " + command + " (usa start | status | stop)");
}
