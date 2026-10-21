# La plantilla en el navegador y la sesión de diseño

La plantilla vive dentro de la skill: `assets/design_md_previewer.html` es un archivo único, sin build, sin servidor propio y sin dependencias. La skill lo sirve por HTTP local durante una sesión para poder añadirle el botón «Guardar en el proyecto».

## La sesión de diseño

```bash
node assets/designmd-session.mjs start --project <raíz-del-proyecto>
```

Levanta un servidor en `127.0.0.1` con puerto efímero, sirve la plantilla e inyecta el botón **«Guardar en el proyecto»**, que escribe el `DESIGN.md` directamente en la raíz del proyecto. Imprime:

```
URL=http://127.0.0.1:44039/
TARGET=/abs/proyecto/DESIGN.md
PROJECT=/abs/proyecto
PREVIEWER=/abs/.../assets/design_md_previewer.html
SESSION=/tmp/opencode/designmd-session-1b4a699512b8.json
BROWSER=xdg-open
```

Si el proyecto ya tenía un `DESIGN.md`, el navegador abre con ese documento ya cargado (personalizaciones intactas) y con la pantalla de bienvenida cerrada.

### Comandos

| Comando | Qué hace |
| --- | --- |
| `start --project <dir> [--out DESIGN.md] [--port N] [--no-open]` | Levanta la sesión y abre el navegador. Una sesión previa del mismo proyecto se apaga antes. |
| `status [--project <dir>] [--wait <seg>]` | Informe JSON de la sesión. Con `--wait` espera a que el usuario exporte. |
| `stop [--project <dir>]` | Apaga el servidor y borra el archivo de sesión. |

### API interna

| Ruta | Uso |
| --- | --- |
| `GET /` | La plantilla con el botón inyectado. |
| `GET /api/config` | `{project, target, fileName, url}` |
| `GET /api/status` | `{saved, file}` — `saved` es `null` hasta que el usuario exporta. |
| `GET /api/previous` | Contenido del `DESIGN.md` anterior al reemplazo. Requiere token. |
| `POST /api/save` | `{content}` → escribe el archivo (escritura atómica) y devuelve `{ok, path, bytes, replaced, warnings}`. Requiere token. |
| `POST /api/stop` | Apaga el servidor. Requiere token. |

El servidor solo acepta conexiones de loopback, solo escribe dentro del directorio del proyecto y exige la cabecera `X-Designmd-Token` (token aleatorio por sesión, que viaja en la página servida y en el archivo de sesión) en toda escritura: un portal cualquiera abierto en otra pestaña no puede tocar el `DESIGN.md`.

### Variables de entorno

- `DESIGNMD_PREVIEWER` — ruta alternativa al HTML de la plantilla.
- `DESIGNMD_RUNTIME_DIR` — dónde viven los archivos de sesión (por defecto `/tmp/opencode`).

## La plantilla por sí sola

Sin sesión, el archivo se abre directamente en el navegador (`file://…/design_md_previewer.html`): cinco pasos (Proyecto, Color, Tipografía, Elevación y bordes, DESIGN.md), lienzo de ejemplo siempre visible con escenarios `Landing` / `Dashboard` / `Formulario`, tema `Claro` / `Oscuro` / `Dual`, dispositivos, panel de salud, diff contra el documento abierto, deshacer/rehacer, presets y exportaciones a CSS, JSON, Tailwind y `.md`.

1. Elige un escenario, un tema y un dispositivo para juzgar los tokens en contexto.
2. Pega colores en el campo de importación: `#AF4D98`, `AF4D98`, listas separadas por coma/espacio/salto de línea, URLs `coolors.co/af4d98-4b3f72` o `0xAARRGGBB`.
3. `Generar paleta` deriva un sistema claro/oscuro coherente a partir de un color o de una lista. Los documentos de una sola columna se mantienen de una sola columna y conservan su formato de color.
4. El panel de salud lista problemas objetivos (contraste por debajo de AA, bordes invisibles, tipografía por debajo de 12px, placeholders sin rellenar, estados sin documentar).
5. Exporta `DESIGN.md`, CSS, JSON o `tailwind.config.js`.

## Precauciones

- El previewer escribe ambas columnas de color; una edición manual solo afecta a la lente activa. Vuelve a leer el archivo exportado antes de entregarlo.
- Las exportaciones no sustituyen al checker: ejecuta `node assets/check-design.mjs DESIGN.md` sobre el archivo final.
- La identidad de proyecto del propio previewer (`Aurora`) es contenido de muestra. Nunca lo copies al documento del usuario; el H1 se mantiene universal.
- El previewer reescribe el documento desde sus controles: una sección libre que no exista en la plantilla puede no sobrevivir a una exportación. Si el proyecto tiene secciones propias, revisa el diff tras exportar.
