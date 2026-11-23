# Modelo de datos canónico — LFP App

Este documento define cómo agregar o actualizar impresoras/modelos sin tocar la lógica de la app.

## Fuente de verdad

- **Datos comerciales**: `data.js` (`window.PRICELIST_MODELS`)
- **Normalización/compatibilidad**: `model.js` (`window.PriceListModel`)
- **Perfiles técnicos TCO** (modos, consumo, energía, cabezales, papeles): `simulador-tco/catalogo-pricelist.js` (`TCO_MODEL_DEFAULTS`). El único default global son las unidades (`unidad: 'm²'`, `unidad_velocidad: 'm²/h'`, `unidad_consumo: 'ml/m²'`); el resto debe definirse por equipo.

La app normaliza datos legacy (`printer_price`, `plans`, `ink_discount`, `price`) al modelo canónico en runtime, pero **los datos nuevos deben escribirse en formato canónico**.

## Plantilla de modelo nuevo

```js
{
  id: 'surecolor-nuevo',              // estable, único, kebab-case
  name: 'Epson SureColor Nuevo',
  category: 'Textile',                // usada por filtros del sidebar
  net_price_usd: 0,                   // canal/costo (solo lectura en UI)
  "markup_%": 0,                      // margen % (canónico interno: markup_pct)
  tco: true,                          // true/false: habilita "Simular Costos" y el equipo en TCO
  base_price_usd: 0,                  // PVP base USD
  fair_price_usd: 0,                  // opcional, 0 si no aplica
  variants: [                         // opcional; si se omite, se crea variante Base implícita
    {
      id: 'base',                     // estable dentro del modelo
      plan: '1 year',                 // título corto del plan/cobertura
      label: 'Base',                  // etiqueta visible
      price_usd: null,                // null = hereda base_price_usd
      ink_discount_pct: 0,            // 0..100
      notes: '',                      // opcional
      is_default: true
    }
  ],
  inks: [
    {
      id: 'tinta-principal',          // estable
      name: 'Tinta ...',
      price_usd: 0,
      capacity_ml: 0
    }
  ],
  inks_sku: [                         // opcional; lista de SKU por capacidad (botón "Lista")
    {
      id: '700',                      // estable dentro del modelo
      tag: '700ml',                   // etiqueta del grupo / chip de filtro
      inks: [
        { SKU: 'T50L220', color: 'C' } // color = clave de colors.js (C, M, Y, K, Mk, Pk, R…)
      ]
    }
  ],
  accesories: [                       // opcional (se normaliza también accessories)
    { id: 'acc-id', label: 'Accesorio', price_usd: 0, SKU: '' }
  ],
  notes: ''
}
```

## Reglas

- **IDs estables**: no cambiar `id`, `variant.id`, `ink.id` después de publicar; los overrides locales (`pl_overrides_v2`) dependen de ellos.
- **Precio efectivo de variante (PVP)**: `price_usd ?? base_price_usd`.
- **Canal / margen / PVP**: `canal = net_price_usd` (modelo, no editable en UI). `margen % = ((PVP - canal) / canal) * 100` cuando `canal > 0`. El modal de edición permite ajustar margen o PVP y recalcula el otro; se persiste el PVP resultante como `base_price_usd`/`variant.price_usd` en overrides.
- **Simulador TCO**: `tco: true` (o `'true'`) habilita el botón `Simular Costos` y la ruta `#tco/<modelId>`. Con `false`/ausente, el botón no se muestra, la ruta cae en la ficha del producto y el modelo se excluye del catálogo TCO. Se normaliza a `tco_enabled` (booleano). Un objeto `tco: { ... }` sigue usándose como configuración técnica opcional del perfil TCO.
- **Descuento efectivo**: `ink_discount_pct` clamp 0..100, default 0.
- **Sin variantes**: omitir `variants` crea una variante implícita `Base`.
- **Overrides**: el editor guarda en `localStorage` por ID estable; migra automáticamente desde `pl_overrides_v1` (label/nombre) cuando es posible.
- **TCO**: el simulador usa la variante seleccionada (`#tco/<modelId>/<variantId>`), pasando `valor_equipo` y `dto_tinta_pct` al motor de cálculo.
- **Equipo activo en TCO**: el simulador se monta con un catálogo de un solo equipo (el modelo que se está revisando) y no muestra selector de equipo. Los campos del modal de uso de tinta se derivan de `ink_skus`.

## Agregar modelo nuevo (checklist)

1. Agregar objeto en `data.js`.
2. Verificar `id` único y IDs estables en variantes/tintas.
3. Si el modelo tiene `tco: true`, agregar su perfil técnico completo en `TCO_MODEL_DEFAULTS` de `simulador-tco/catalogo-pricelist.js` (tipo, modos, potencias, cabezales, vida útil, papeles, consumibles) o definirlo en `model.tco`. Solo las unidades tienen default global.
4. Subir versión de `CACHE_NAME` en `sw.js` si se quiere forzar actualización inmediata del app shell.
5. Probar: lista/búsqueda, detalle, selector de variantes, editar precios, simulador TCO, cálculo con descuento, persistencia tras recarga, offline tras actualizar SW.

## Lista de tintas / SKU (`inks_sku`)

- **Uso**: el botón `Lista` de la tarjeta `Tintas (PVP)` abre un modal con los SKU del modelo.
- **Agrupación**: cada entrada de `inks_sku` es un grupo con su `tag` (ej. `350ml`, `700ml`); el modal muestra un chip por tag para filtrar los grupos.
- **Color**: el campo `color` de cada SKU es una clave de `colors.js` (`C`, `M`, `Y`, `K`, `HDK`, `Mk`, `Pk`, `R`…). La app toma `name` y `hex` de ese catálogo para pintar el círculo y mostrar el nombre.
- **Normalización**: `model.js` expone `ink_skus` con `{ id, tag, inks: [{ sku, color }] }`, aplica `trim()` a los SKU y acepta `SKU`/`sku`.
- **Simulador TCO**: `buildTcoCatalog` copia `ink_skus` al equipo (`equipo.ink_skus`). El modal **Uso de tinta por color** crea un campo por cada color distinto (en orden de aparición) y usa el `color` para resolver el HEX de `colors.js`.
- **Costo de tinta**: el motor usa el mayor costo por ml entre las tintas del equipo (con el descuento de la variante aplicado). Si no hay tintas válidas, usa el precio/ml de la variante.
- Si un color no existe en `colors.js`, se muestra el código como nombre y un círculo gris (`#cccccc`).

## Módulo Sustratos (catálogo global para TCO)

- **Datos base**: `sustratos.js` (`window.PRICELIST_SUBSTRATES`) — catálogo de solo lectura usado por TCO.
- **Integración TCO**: `buildTcoCatalog(..., { sustratos })` mapea sustratos activos a `equipo.papeles`; el simulador usa `costo/(ancho*longitud)` como costo base por m².
- **Prioridad**: si el perfil del equipo (`TCO_MODEL_DEFAULTS` o `model.tco`) define `papeles`, esos se usan en el selector “Sustrato / Papel”. El catálogo global de `sustratos.js` es el fallback para equipos sin `papeles` definidos.

Campos por sustrato:

```js
{
  id: 'sustrato-generico',   // estable
  categoria: 'General',
  nombre: 'Sustrato genérico',
  longitud_m: 50,
  ancho_m: 1.52,
  precio_usd: 60,
  desperdicio_pct: 3         // opcional, 0..99.99, default 0
}
```

- **Costo/m² derivado**: `precio_usd / (ancho_m * longitud_m)`.
- Si el equipo no define `papeles`, el adaptador TCO usa el catálogo global activo. Si ambos están vacíos, `equipo.papeles` queda vacío y el selector muestra `—`.

## Compatibilidad legacy aceptada por el normalizador

- `printer_price` -> `base_price_usd`
- `fair_price` -> `fair_price_usd`
- `plans[]` -> `variants[]`
- `plan.price` -> `variant.price_usd`
- `plan.ink_discount` -> `variant.ink_discount_pct`
- `ink.price` -> `ink.price_usd`
