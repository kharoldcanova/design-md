# design-md

[![skills.sh](https://skills.sh/b/kharoldcanova/design-md)](https://skills.sh/kharoldcanova/design-md)

Skill para agentes de IA que define el sistema visual de un proyecto (paleta, tipografía, espaciado, radios, estados y design tokens) generando un `DESIGN.md` canónico y verificable.

El diseño se decide en el navegador: la skill abre una plantilla interactiva, el usuario configura su sistema visual y exporta el documento directamente a la raíz del proyecto. La skill guía, verifica y entrega.

## Instalación

```bash
npx skills add kharoldcanova/design-md
```

También se puede clonar y copiar la carpeta a tu directorio de skills:

```bash
git clone https://github.com/kharoldcanova/design-md.git ~/.config/opencode/skills/design-md
```

## Requisitos

- Node.js 18 o superior (sin dependencias de npm).
- Un navegador para abrir la plantilla. El checker y el servidor de sesión funcionan sin navegador.

## Qué incluye

| Ruta | Qué es |
| --- | --- |
| `SKILL.md` | La skill: activación, reglas, flujo de 7 pasos y modo entrevista. |
| `assets/design_md_previewer.html` | La plantilla en el navegador: cinco pasos, lienzo de ejemplo, panel de salud, diff, deshacer/rehacer y exportaciones a `DESIGN.md`, CSS, JSON y Tailwind. Un solo archivo, sin build. |
| `assets/designmd-session.mjs` | Servidor local de sesión (`start` / `status` / `stop`) que sirve la plantilla e inyecta el botón «Guardar en el proyecto». |
| `assets/check-design.mjs` | Checker del documento: estructura canónica, tabla de tokens, placeholders y contraste AA. Sale con código 1 si hay `FAIL`. |
| `assets/DESIGN.template.md` | Esqueleto canónico del `DESIGN.md`; base del modo entrevista. |
| `references/palette-system.md` | Derivación de una paleta luz/oscuro a partir de un color semilla. |
| `references/previewer.md` | Detalle de la sesión, de la API interna y de las precauciones del previewer. |

## Flujo

1. Localiza la raíz del proyecto y su `DESIGN.md` actual, si existe.
2. Levanta la sesión y abre la plantilla en el navegador.
3. Guía al usuario por proyecto, color, tipografía y elevación.
4. Espera la exportación del documento.
5. Verifica el archivo con el checker (`node assets/check-design.mjs <proyecto>/DESIGN.md`).
6. Cierra la sesión.
7. Reporta la ruta, la tabla de tokens y el veredicto del checker.

Si el usuario rechaza el navegador, la skill entra en modo entrevista: pregunta como máximo cinco datos, deriva la paleta y la tipografía, escribe el `DESIGN.md` desde la plantilla y lo verifica igual.

## Verificación

La skill se comprueba con el checker sobre el documento final:

```bash
node assets/check-design.mjs <proyecto>/DESIGN.md
```

Sale con código 1 si hay `FAIL` (estructura, tokens, placeholders o contraste).

## Licencia

Apache-2.0. Ver [LICENSE](LICENSE).
