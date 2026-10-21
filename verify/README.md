# Verificación de la skill `design-md`

Tres suites con Playwright + Chromium. Ninguna añade dependencias a la plantilla.

```bash
node verify/smoke.mjs     # el previewer: 24 comprobaciones sobre la UI real
node verify/session.mjs   # la sesión: 10 comprobaciones, del navegador al archivo del proyecto
node verify/e2e.mjs       # el flujo completo: 10 comprobaciones de la skill de punta a punta
```

- `PLAYWRIGHT_MODULE` — ruta al paquete `playwright` (se autodetecta en `~/.npm/_npx/*/node_modules/playwright`).
- `CHROMIUM_PATH` — binario de Chromium (por defecto `/usr/bin/chromium`).

## `smoke.mjs` — la plantilla

Abre `assets/design_md_previewer.html` en Chromium y recorre la interfaz real: carga y API pública, pantalla de inicio, documento de ejemplo universal, los cinco pasos con el lienzo siempre visible, escenario/tema/dispositivo, panel de salud, documento en solo lectura y diff, generación de paleta desde un valor de coolors.co, una lista y un enlace, entrada inválida, «Aplicar al rol», exportaciones CSS/JSON/Tailwind, estilos presets, deshacer/rehacer, cero errores de consola y el verificador `assets/check-design.mjs` sobre el documento exportado.

## `session.mjs` — la sesión de diseño

Levanta `assets/designmd-session.mjs` contra dos proyectos temporales, abre el navegador y comprueba que el botón «Guardar en el proyecto» existe y apunta al destino, que el destino se muestra junto al documento, que exportar escribe el `DESIGN.md` en el proyecto con el contenido exacto del previewer, que la interfaz confirma el guardado, que la sesión registra la exportación, que un `DESIGN.md` existente se carga en el navegador (y no la plantilla), que exportar lo reemplaza y lo deja constancia, y que no hay errores de consola.

## `e2e.mjs` — el flujo de la skill

Sigue el `SKILL.md` al pie de la letra, como lo haría un agente: levantar la sesión, abrir el navegador, configurar proyecto, color y tipografía, exportar y auditar el documento con `assets/check-design.mjs`. Comprueba que el `DESIGN.md` resultante llega al proyecto, que el checker lo acepta sin `FAIL`, que no quedan marcadores sin rellenar, que la estructura canónica se conserva y que no hay errores de consola.

Salida: `N passed, M failed`; sale con código 1 si algo falla.
