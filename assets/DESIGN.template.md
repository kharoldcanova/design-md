# DESIGN.md - Sistema de Diseño Universal

> Este documento define la fuente de la verdad para la interfaz de usuario (UI) y experiencia de usuario (UX) del proyecto. 
> **Instrucción para la IA:** Respeta estrictamente estos tokens, convenciones y reglas en cualquier código generado (Flutter, React, Tailwind, CSS nativo, etc.). No inventes colores, fuentes ni estilos fuera de este sistema.

---

## 1. Visión y Filosofía del Producto
* **Propósito:** [Descripción breve de la aplicación y su objetivo principal].
* **Estética Core:** [Ej: Minimalista, Cyberpunk, Clean, Dark-mode first, etc.].
* **Principios de UX:**
  * **Claridad sobre ornamentación:** La información jerárquica debe leerse en menos de 3 segundos.
  * **Feedback inmediato:** Toda acción del usuario debe tener respuesta visual instantánea (estados hover, active, loading).
  * **Accesibilidad:** Alto contraste, tamaños táctiles adecuados y soporte para navegación por teclado/screen readers.

---

## 2. Design Tokens (La Fundación)

### 2.1. Paleta de Colores
Utiliza nombres semánticos en lugar de valores absolutos en el código.

| Token Semántico | Valor Hex / Light | Valor Hex / Dark | Uso Principal |
| :--- | :--- | :--- | :--- |
| `--bg-base` | `#FFFFFF` | `#0A0A0C` | Fondo principal de la aplicación |
| `--bg-surface` | `#F4F4F5` | `#141417` | Tarjetas, contenedores, paneles |
| `--bg-elevated` | `#E4E4E7` | `#1E1E24` | Modales, dropdowns, elementos flotantes |
| `--text-primary` | `#09090B` | `#FAFAFA` | Títulos y texto principal |
| `--text-secondary` | `#71717A` | `#A1A1AA` | Subtítulos, metadatos, iconos inactivos |
| `--primary` | `#2563EB` | `#3B82F6` | Botones de acción principal, enlaces, estados activos |
| `--accent` | `#7C3AED` | `#8B5CF6` | Elementos destacados, highlights, modo especial |
| `--success` | `#16A34A` | `#22C55E` | Mensajes de éxito, estados online, confirmaciones |
| `--warning` | `#CA8A04` | `#EAB308` | Alertas, advertencias |
| `--error` | `#DC2626` | `#EF4444` | Errores, acciones destructivas |
| `--border` | `#E4E4E7` | `#27272A` | Bordes, separadores, líneas divisorias |

### 2.2. Tipografía
* **Familia Tipográfica Principal:** `Inter`, `Geist`, `Roboto`, system-ui, sans-serif.
* **Familia Tipográfica Monospace (Código/Datos):** `JetBrains Mono`, `Fira Code`, monospace.

| Estilo | Tamaño (Desktop) | Tamaño (Mobile) | Peso (Font Weight) | Line Height |
| :--- | :--- | :--- | :--- | :--- |
| **Heading 1** | 32px (2rem) | 24px (1.5rem) | Bold (700) | 1.2 |
| **Heading 2** | 24px (1.5rem) | 20px (1.25rem) | SemiBold (600) | 1.3 |
| **Heading 3** | 18px (1.125rem) | 16px (1rem) | SemiBold (600) | 1.4 |
| **Body Large** | 16px (1rem) | 15px (0.9375rem)| Regular (400) | 1.5 |
| **Body Regular** | 14px (0.875rem)| 14px (0.875rem)| Regular (400) | 1.5 |
| **Caption / Small**| 12px (0.75rem) | 12px (0.75rem) | Medium (500) | 1.4 |

### 2.3. Espaciado y Dimensiones (Grid de 4px / 8px)
* `xs`: 4px (`0.25rem`)
* `sm`: 8px (`0.5rem`)
* `md`: 16px (`1rem`)
* `lg`: 24px (`1.5rem`)
* `xl`: 32px (`2rem`)
* `2xl`: 48px (`3rem`)

### 2.4. Bordes y Radios (Border Radius)
* `radius-sm`: 6px (Elementos internos pequeños, tags)
* `radius-md`: 10px (Botones, inputs, tarjetas estándar)
* `radius-lg`: 16px (Modales, contenedores grandes)
* `radius-full`: 9999px (Avatares, botones circulares, pills)

---

## 3. Componentes Base y Estados Obligatorios

Cualquier componente interactivo **debe** contemplar los siguientes estados visuales:
1. **Default:** Estado base del componente.
2. **Hover:** Al pasar el cursor por encima (cambio sutil de tono o elevación).
3. **Active / Pressed:** Al hacer clic o tocar.
4. **Focus:** Indicador de accesibilidad visible (outline o anillo de enfoque usando `--primary`).
5. **Disabled:** Opacidad reducida (`0.5`), cursor `not-allowed`, sin eventos.
6. **Loading (Opcional):** Sustitución de contenido por skeleton o spinner manteniendo dimensiones.

### 3.1. Botones
* **Primary:** Fondo `--primary`, texto blanco/oscuro según contraste, radio `radius-md`.
* **Secondary / Outline:** Fondo transparente, borde `--border`, texto `--text-primary`.
* **Ghost:** Sin fondo ni borde, texto `--text-secondary`, adquiere fondo sutil en hover.

### 3.2. Formularios e Inputs
* Altura estándar: `40px` (Desktop) / `44px` (Mobile touch target).
* Fondo: `--bg-surface`.
* Borde: `--border`. En foco cambia a `--primary`.
* Mensaje de error: Texto en `--error` situado exactamente debajo del input con margen `xs`.

---

## 4. Guías de Implementación para la IA

* **Regla 1 (Cero Hardcoding):** Nunca utilices colores en hexadecimal directos (ej. `#3B82F6`) en los componentes de UI. Utiliza siempre las variables semánticas o tokens definidos en la sección 2.
* **Regla 2 (Consistencia Responsive):** Prioriza un enfoque *mobile-first*. Los contenedores principales deben adaptarse fluidamente usando Flexbox o Grid.
* **Regla 3 (Naming Conventions):** Mantén coherencia en los nombres de clases o widgets según el framework del proyecto (ej. camelCase para Flutter, kebab-case para CSS/Tailwind).
* **Regla 4 (Feedback de Cambios):** Si se añade un nuevo componente que no está listado aquí, documenta primero su estructura de tokens antes de codificarlo. 

