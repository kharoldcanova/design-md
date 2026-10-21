# Sistema de paletas — derivación y contraste

Referencia de `design-md`. Léela solo cuando derives o repares una paleta.

## Roles (semánticos, nunca absolutos)

| Token | Intención | Línea base clara | Línea base oscura |
| --- | --- | --- | --- |
| `--bg-base` | lienzo de la app | `#FFFFFF` o tinte del 1–3% del tono de marca | casi negro, tinte del 2–6% del tono de marca |
| `--bg-surface` | tarjetas, paneles | lienzo + 1 nivel de elevación | lienzo + 1 nivel de elevación |
| `--bg-elevated` | modales, menús, popovers | lienzo + 2 niveles de elevación | lienzo + 2 niveles de elevación |
| `--text-primary` | títulos, cuerpo | casi negro (no `#000` puro) | casi blanco (no `#FFF` puro) |
| `--text-secondary` | pies, metadatos, iconos | ≥ 4.5:1 sobre base **y** surface | ≥ 4.5:1 sobre base **y** surface |
| `--primary` | acción principal, enlaces, activo | color semilla | color semilla, +8–12% de luminosidad |
| `--accent` | resaltes, énfasis secundario | tono semilla ±30–60° | mismo tono, mayor luminosidad |
| `--success` / `--warning` / `--error` | estado | bandas de tono fijas ~145° / 45° / 0° | más brillantes, ~55–65% de luminosidad |
| `--border` | separadores, bordes de inputs | visible sobre base, 1.3–1.6:1 | igual |

## Derivar desde una sola semilla

1. Convierte la semilla a HSL. Pasa a ser `--primary` salvo que sea demasiado clara u oscura para una etiqueta.
2. Conserva el tono; define las superficies con escalones de luminosidad de ~3–5% (`base` → `surface` → `elevated`).
3. `--text-primary` = tono del lienzo con S ≈ 5–12%, L ≈ 8% (tema claro) / 97% (tema oscuro).
4. `--text-secondary` = mismo tono, S ≈ 8–15%, con L elegida para superar 4.5:1 sobre `surface`, no solo sobre `base`.
5. `--accent` = tono rotado +40° (o −40° si la semilla ya es cálida), misma banda de S, L ajustada para el contraste.
6. Los colores de estado mantienen su tono convencional; solo ajusta L para pasar el contraste. Nunca dependas solo del tono para comunicar un estado: acompáñalo con un icono o una etiqueta.
7. El tema oscuro no es una inversión: baja un poco el croma, sube la luminosidad del texto y del primario, baja la de las superficies y conserva la familia de tonos.

## Objetivos de contraste (WCAG 2.1 AA)

| Par | Mínimo |
| --- | --- |
| Texto de cuerpo/etiqueta vs su fondo | 4.5:1 |
| Texto ≥ 24px, o ≥ 18.66px en negrita | 3:1 |
| Borde de input/control vs color adyacente | 3:1 |
| Anillo de foco vs color adyacente | 3:1 |
| Separador decorativo | visible (~1.3:1), sin requisito AA |

## Movimientos de reparación, en orden

1. Aleja la luminosidad del texto respecto al lienzo antes de tocar el color de marca.
2. Oscurece `--primary` en el tema claro / acláralo en el tema oscuro hasta que el texto de enlace pase.
3. Si un color de estado falla como texto, conserva el color de relleno y añade una variante de texto más oscura para mensajes en línea.
4. Si un relleno no puede soportar una etiqueta 4.5:1 ni en blanco ni en casi negro, cambia el relleno: no publiques ese par.

## Nunca

- Valores hex fuera de la tabla de tokens, o un token declarado para un solo tema.
- `#000` puro sobre `#FFF` puro como único par de texto (halación, sin jerarquía).
- Un color de estado como único portador de significado.
- Un `--primary` que falle como enlace sobre `--bg-base`; añade un `--primary-strong` separado solo si la plantilla no permite alternativa.

## Verificación

Ejecuta `node assets/check-design.mjs <ruta-a-DESIGN.md>`. Analiza la tabla dual e informa cada ratio.
Los `WARN` son decisiones de criterio; los `FAIL` deben corregirse antes de entregar.
