# LFP App

PWA de precios Epson LFP con simulador TCO.

## Características
- Catálogo de impresoras LFP con precios USD/COP.
- Simulador TCO con desglose por `m²`/`Und`.
- Modal de uso de tinta por color con cálculo de rendimiento basado en `capacity_ml`.
- Filtros por categoría y búsqueda en portada.
- PWA offline con Service Worker versionado.

## Requisitos
- Navegador moderno con soporte PWA.
- Servidor estático (ej. `python -m http.server`).

## Uso local
```bash
cd C:\pricelist
python -m http.server 8085
# abrir http://localhost:8085/
```

## Estructura
- `index.html`, `app.js`, `styles.css`, `sw.js`
- `data.js`, `model.js`, `colors.js`, `sustratos.js`
- `simulador-tco/`

## Licencia
Uso interno.
