---
name: design-md
description: "Trigger: DESIGN.md, paleta de colores, color palette, tipografía, typography, design tokens, define el diseño de la app. Abre la plantilla en el navegador, el usuario configura su sistema visual y lo exporta a su proyecto."
license: Apache-2.0
metadata:
  author: "kharoldcanova"
  version: "2.1"
---

## Activación

Carga esta skill cuando el usuario quiera definir o cambiar el sistema visual de un proyecto (paleta, tipografía, espaciado, radios, estados, design tokens) o pida crear, completar o actualizar un `DESIGN.md`. No la cargues para reestilizar un solo componente de un sistema ya existente.

## Reglas

- El documento de la plantilla es canónico: no renumeres, reordenes ni omitas secciones; corrige solo valores.
- Cada token de color lleva Light y Dark (`#RRGGBB`); las secciones 3–4 usan solo tokens semánticos.
- Sin `[placeholders]`: no inventes nombre, color ni audiencia.
- Cuerpo del documento en el idioma de la plantilla; nombres de token y código en inglés.
- Escribe el `DESIGN.md` el usuario desde el navegador. La skill solo lo fabrica en modo entrevista.

## Flujo

1. **Localiza el proyecto**: su raíz y, si existe, su `DESIGN.md` actual. No preguntes nada todavía: la plantilla pregunta en pantalla.

2. **Abre la plantilla en el navegador**:

   ```bash
   node <skill-dir>/assets/designmd-session.mjs start --project <raíz-del-proyecto>
   ```

   Imprime `URL=`, `TARGET=` y `SESSION=`, y abre el navegador. Si el proyecto ya tenía un `DESIGN.md`, el navegador lo abre cargado.

3. **Guía con cuatro instrucciones**: proyecto (nombre, concepto, plataforma), color (semilla en el importador o preset), tipografía (fuente principal y cuerpo) y elevación (radios, borde, sombra). El panel de salud indica si el sistema está en AA.

4. **Espera la exportación**:

   ```bash
   node <skill-dir>/assets/designmd-session.mjs status --project <raíz-del-proyecto> --wait 900
   ```

   Si `saved` es `null`, dile que pulse «Guardar en el proyecto» y vuelve a consultar. No copies nada a mano.

5. **Verifica**:

   ```bash
   node <skill-dir>/assets/check-design.mjs <raíz-del-proyecto>/DESIGN.md
   ```

   Salida 1 = hay `FAIL`: no entregues, corrige solo valores y repite. Justifica o corrige cada `WARN`. Si el proyecto ya tenía un `DESIGN.md`, muestra `git diff -- DESIGN.md` y di qué se preservó.

6. **Cierra la sesión** (opcional):

   ```bash
   node <skill-dir>/assets/designmd-session.mjs stop --project <raíz-del-proyecto>
   ```

7. **Reporta**: ruta del `DESIGN.md`; tabla de tokens (`token | light | dark`); decisiones de tipografía; veredicto del checker con cada `WARN` aceptado; qué dio el usuario y qué derivó la plantilla; y, si el documento existía, las filas tocadas y lo que se preservó.

## Fallback: modo entrevista

Úsalo solo si el usuario rechaza el navegador, no hay navegador, o pide una versión rápida. Pregunta como máximo cinco datos que falten, deriva paleta y tipografía desde `references/palette-system.md`, escribe el `DESIGN.md` desde `assets/DESIGN.template.md`, verifica con el checker y reporta. Si el documento existe, léelo completo y conserva sus personalizaciones; nunca lo sobrescribas en silencio.

## Referencias

- `assets/DESIGN.template.md` — esqueleto canónico del documento.
- `assets/design_md_previewer.html` — la plantilla en el navegador.
- `assets/designmd-session.mjs` — servidor de sesión: `start` / `status` / `stop`.
- `assets/check-design.mjs` — auditoría de estructura y contraste; sale con 1 si hay `FAIL`.
- `references/palette-system.md` — derivación de paleta desde un color semilla.
- `references/previewer.md` — detalle de la sesión de diseño, de su API interna y de las precauciones del previewer.
