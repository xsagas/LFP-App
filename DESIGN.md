# Design System: LFP App

## 1. Visual Theme & Atmosphere

A restrained, product-operations interface: clean paper surfaces on a soft canvas, strong typographic hierarchy, and a single deep-navy brand accent. The feel is precise and utilitarian rather than expressive—built for quick scanning, comparison, and configuration of printer pricing and cost simulation.

**Key Characteristics:**
- Monochromatic base (white, warm grays, near-black ink) with one brand accent (`#03045e`)
- Card-and-panel composition with clear separation, generous padding, and rounded corners
- Calm, low-noise UI; emphasis comes from hierarchy, spacing, and accent use—not decoration
- Data-first readability (prices, specs, tables, KPIs) with consistent labeling

## 2. Color Palette & Roles

### Brand / Accent
- **Deep Navy** `#03045e`: Primary brand/action color, active states, product/TCO headers, focus accents, key highlights. Pairs with white text for strong contrast.
- **Brand Ink (on accent)** `#ffffff`: Text/icons on brand backgrounds.

### Neutrals & Surfaces
- **Canvas** `#f5f5f5`: App/page background, subtle fills.
- **Surface (Sidebar/Alt)** `#fafafa`: Secondary surfaces, notes headers, table headers in TCO, muted fills.
- **Paper** `#ffffff`: Primary cards, dialogs, inputs, content surfaces.
- **Ink** `#0a0a0a`: Primary text and high-emphasis values.
- **Ink Muted** `#595959`: Secondary text, labels, metadata, helper copy (chosen for accessible contrast on light surfaces).
- **Hairline** `#e5e5e5`: Borders, dividers, separators.

### Functional / State
- **Soft Brand Tint** `rgba(3,4,94,0.04)` / `rgba(3,4,94,0.08)`: Subtle emphasis rows/highlights in TCO tables (brand-aligned, low-chroma).
- **Focus / Emphasis**: Brand-colored outlines/borders (`#03045e`) for focus-visible and active controls.
- **Error/Alert**: Neutral surface with clear brand-bordered treatment (no side-tab accent), prioritizing readability and consistency.

## 3. Typography Rules

**Primary family (implemented):** `Inter`, with system fallbacks: `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.

**Character:** Neutral, highly legible UI sans for dense product data and controls. Inter is an intentional implementation choice for availability and consistency in this PWA, with an offline-friendly local/system fallback stack (no external webfont dependency). Hierarchy is expressed through size, weight, spacing, and color rather than display novelty.

### Hierarchy & usage
- **Display / Page title**: Large, bold, tight tracking (responsive clamp). Used for cover/title moments.
- **Section / Product title**: Prominent bold headings (`.title1`, card titles) with clear contrast on brand headers.
- **Body / UI text**: 14–16px effective range for controls/content; regular to semibold weights.
- **Labels & meta**: Small uppercase or compact labels with increased letter-spacing and muted color for secondary information.
- **Data emphasis**: Semibold/bold numeric and key values; tabular figures where helpful for alignment/scanning.

## 4. Component Stylings

### Buttons & Actions
- **Primary action controls**: Brand-filled or brand-outlined states depending on context; clear hover/focus-visible treatment.
- **Secondary/icon buttons**: Bordered paper/surface buttons, rounded; 44×44px minimum touch targets for key icon controls.
- **Segmented controls/toggles**: Pill/rounded segments with obvious active state (brand fill + white text).

### Cards / Containers
- **Cards**: White paper background, hairline border, soft shadow, large radius (24px) and internal padding.
- **Nested boxes**: Smaller radius (10px), bordered, used for price/spec groups.
- **Headers**: Brand background sections for product/TCO context with inverted (white) text.

### Inputs & Forms
- **Text/search inputs**: Bordered, rounded controls on paper; brand focus ring/border; comfortable padding and 16px input text on mobile contexts to avoid zoom issues.
- **Dialogs**: Centered modal with surface header, clear close action, form fields, and action row.

### Navigation & Lists
- **Model picker/sidebar**: Scrollable list of model buttons with active state in brand color; mobile drawer behavior.
- **Search (cover and picker)**: Inline clear action, visible result/count feedback, and keyboard-friendly flow (Enter opens first match when applicable).

### Data Display
- **Tables**: Bordered rows, muted uppercase headers, semantic emphasis rows for sections/subtotals/totals using subtle brand tints.
- **Charts (TCO)**: Line chart for payback flows with accessible label/description and reduced-motion-aware animation.
- **Chips/badges**: Compact rounded labels for metadata and highlights.

## 5. Layout Principles

- **App shell**: Fixed-height workspace with independent scroll regions (picker and content/stage) for stable navigation.
- **Responsive behavior**: Single-column emphasis on small screens; multi-column grids for KPIs/price boxes/tables where space allows.
- **Spacing & rhythm**: Consistent gaps/padding scale; grouped related controls tightly and separated sections clearly.
- **Container width**: Content centered with max widths for readability (product/cover cards).
- **Accessibility baseline**: Visible focus states, keyboard-operable dialogs/controls, semantic labels, reduced-motion support, and touch-friendly target sizing.