# Especificación Funcional y Técnica: Simular Costos — Arquitectura 100% Client-Side

> **Documento de arquitectura e ingeniería** derivado del análisis de la especificación original de ChannelTools (`/var/www/channeltools`), reestructurado para ejecutarse **íntegramente en el navegador (sin backend)** e integrarse como un módulo embebible dentro de una aplicación anfitriona (*Host App*).

---

## 1. Propósito, Alcance y Cambio de Paradigma

El Simulador de Costos calcula el **TCO (Costo Total de Propiedad) por unidad de salida** (`m²` o `Und`), el desglose de costos variables/fijos, el consumo mensual de tintas y el análisis de **PayBack descontado** para equipos de impresión de gran formato.

### 1.1 Transformación Arquitectónica

| Dimensión | Arquitectura Original (Legacy) | Nueva Arquitectura (Client-Side Embebible) |
| :--- | :--- | :--- |
| **Ejecución** | PHP 8.1+ / MVC / MariaDB (PDO) | **100% Navegador** (Zero-Backend) |
| **Motor de Cálculo** | `TCOCalculator.php`, `SimuladorService.php`, `PaybackService.php` | **Módulos JavaScript (ES6+)** puros y deterministas |
| **Interfaz y Layout** | AdminLTE 3 + PHP templates | **HTML5 Semántico + Bootstrap 5** (WCAG 2.1 AA) |
| **Visualización** | Chart.js (carga diferida por meta tag) | **Chart.js v4** (integrado en el módulo) |
| **Comunicación** | `POST /calcular`, `POST /calcular/payback`, `POST /escenarios/guardar` | **API JavaScript pública (`window.ChannelToolsTCO`) + CustomEvents** hacia la App Anfitriona |
| **Fuente de Datos** | `<script id="sim-catalogo">` renderizado por PHP | **Inyección de catálogo JSON** vía método `mount(container, config)` |

### 1.2 Alcance Funcional del Módulo
1. **Inicialización e Inyección de Datos**: Recepción del catálogo (equipos propios, otras marcas, parámetros globales) y estado inicial desde la aplicación principal.
2. **Motor de Simulación TCO en JS**: Validación de entradas en formato español (`1200,50`), cálculo de CVU, CFU, TCO y estimación de consumo/desperdicio de tintas.
3. **Motor de PayBack Descontado en JS**: Cálculo interactivo con *debounce* (350 ms) de precio de venta sugerido, flujo mensual, payback simple/descontado y generación de serie temporal.
4. **Renderizado Reactivo y Gráficos**: Actualización de KPIs, tabla de desglose accesible y gráfico de evolución de PayBack con Chart.js.
5. **Contrato de Integración (Host Bridge)**: Emisión de eventos y entrega de payloads estructurados (`contexto` y `resultados`) para que la aplicación padre gestione el guardado de escenarios, navegación o comparativas.

---

## 2. Arquitectura del Módulo y Estructura de Archivos

El simulador se empaqueta como un componente autocontenido que puede montarse en un contenedor DOM (`<div id="app-simulador-tco"></div>`) dentro de cualquier aplicación web.

```text
simulador-tco/
├── index.html                  # Vista HTML5 + Bootstrap 5 (autocontenida o fragmento)
├── css/
│   └── simulador-tco.css       # Estilos complementarios a Bootstrap 5 y foco WCAG
└── js/
    ├── core/
    │   ├── FormatoEs.js        # Parseo (parseDecimalEs) y formateo (fmtEs) numérico español
    │   ├── TintaService.js     # Cálculo de costo por ml (promedio y máximo) y sets de color
    │   ├── TCOCalculator.js    # Motor matemático puro de costos variables, fijos y TCO
    │   └── PaybackService.js   # Motor financiero de pricing, payback simple/descontado y series
    ├── state/
    │   └── SimuladorStore.js   # Gestión de catálogo, resolución de entidades y estado reactivo
    ├── ui/
    │   ├── ChartManager.js     # Ciclo de vida de la instancia Chart.js (render, update, destroy)
    │   └── SimuladorUI.js      # Controlador del DOM, cascadas de selects, accesibilidad y eventos
    └── index.js                # Punto de entrada y API pública (window.ChannelToolsTCO)
```

---

## 3. Glosario y Reglas de Unidades

Se preservan exactamente las reglas de negocio y convenciones del sistema original para garantizar paridad matemática del 100%:

| `tipo` de Equipo | `unidad` (Salida) | `unidad_velocidad` | `unidad_consumo` | `unidad_costo` |
| :--- | :--- | :--- | :--- | :--- |
| `RollToRoll`, `Cama Plana` u otro no DTG | `m²` | `m²/h` | `ml/m²` | `USD/m²` |
| `DTG` | `Und` | `Und/h` | `ml/Und` | `USD/Und` |

> **Regla de Paridad Literal**: No existe conversión numérica entre `m²` y `Und`. Para `DTG`, el motor reutiliza las propiedades `velocidad_m2h`, `consumo_ml_m2` y las claves de salida `*_m2`, modificando únicamente las etiquetas visuales en la UI.

---

## 4. Contrato de Integración con la Aplicación Principal (Host API)

Dado que el simulador será invocado desde una aplicación más grande, **no realiza peticiones HTTP** ni gestiona tokens CSRF. En su lugar, expone una API JavaScript y despacha eventos estándar del DOM.

### 4.1 Inicialización desde la App Padre

La aplicación anfitriona monta el simulador pasando el selector o nodo contenedor, el catálogo JSON y los *callbacks* de integración:

```javascript
const simulador = window.ChannelToolsTCO.mount('#contenedor-simulador', {
  catalogo: {
    globales: {
      costo_mo_mensual: 964.30,
      arrendamiento_mensual: 0.0,
      meses_depreciacion: 60.0,
      tiempo_cambio_meses: 36.0,
      costo_kwh: 0.23,
      pct_desperdicio: 1.0,
      metros_mes_default: 1200.0,
      horas_dia_default: 4.0
    },
    equipos: [ /* Array de fichas de equipos propios */ ],
    equiposOtras: [ /* Array de fichas de competencia */ ]
  },
  equipoInicialId: 3, // Opcional (equivale al antiguo ?equipo_id=3)
  escenarioPrecargado: null, // Opcional: permite abrir el simulador con datos previos

  // Callbacks hacia la App Principal
  onCalculado: (evento) => { /* { payload, data, contexto } */ },
  onPaybackCalculado: (evento) => { /* { data } */ },
  onError: (error) => { /* { codigo: 422, mensaje: '...' } */ }
});
```

### 4.2 Estructura del Catálogo Inyectado (`fichaEquipo`)

Cada objeto dentro de `catalogo.equipos` y `catalogo.equiposOtras` debe cumplir con el siguiente esquema:

```jsonc
{
  "id": 3,
  "otra_marca": false,
  "modelo": "SureColor S7170",
  "tipo": "RollToRoll",
  "unidad": "m²",
  "unidad_velocidad": "m²/h",
  "unidad_consumo": "ml/m²",
  "pvp_equipo": 14500.0,
  "pct_desperdicio": 1.0,
  "num_cabezales": 1,
  "pvp_cabezal": 980.0,
  "vida_util_meses": 36.0,
  "power_print": 1.145,
  "power_stby": 0.03,
  "pvp_coverplus": 0.0,
  "variantes": [
    {
      "id": 7,
      "orden": 1,
      "modelo": "S7170 - Pack",
      "pvp_equipo": 14500.0,
      "dto_tinta_pct": 10.0,
      "precio_tinta": 92.183,
      "precio_tinta_ml": 0.1152
    }
  ],
  "modos": [
    {
      "id": 12,
      "orden": 1,
      "nombre": "Alta velocidad",
      "velocidad_m2h": 18.5,
      "consumo_ml_m2": 8.86
    }
  ],
  "papeles": [
    {
      "id": 5,
      "nombre": "Banner 13 oz",
      "categoria": "Signage",
      "costo": 108.54,
      "ancho": 1.52,
      "longitud": 50.0,
      "desperdicio_pct": 0.0
    }
  ],
  "tintas": [
    { "color_code": "C", "volumen_ml": 800.0, "pvp": 92.18 }
  ],
  "consumibles": [
    { "referencia": "Wiper Kit", "cantidad": 1, "pvp": 300.0, "vida_util_dias": 90 }
  ]
}
```

> **Nota sobre variantes**: Si un equipo llega con `variantes: []`, `SimuladorStore.js` sintetiza automáticamente una variante por defecto con `id: 0`, `pvp_equipo: equipo.pvp_equipo` y `dto_tinta_pct: 0`.

> **Nota sobre defaults técnicos**: El único default global del catálogo son las unidades (`unidad: 'm²'`, `unidad_velocidad: 'm²/h'`, `unidad_consumo: 'ml/m²'`; para `DTG` se fuerzan `Und`, `Und/h`, `ml/Und`). El resto de campos técnicos (`tipo`, `modos`, `pct_desperdicio`, `num_cabezales`, `pvp_cabezal`, `vida_util_meses`, `power_print`, `power_stby`, `pvp_coverplus`, `papeles`, `consumibles`) debe venir definido en el perfil del equipo o en `model.tco`; si falta, se usa vacío/0.

### 4.3 Métodos Públicos de la Instancia

* `simulador.setCatalogo(nuevoCatalogo)`: Permite a la app padre actualizar precios, TRM o equipos en caliente sin recargar la página.
* `simulador.seleccionarEquipo(equipoId)`: Cambia programáticamente el equipo activo (útil si el usuario selecciona un equipo en otra vista de la app padre).
* `simulador.getEstadoActual()`: Devuelve `{ parametros, resultados, payback, ultimoPayload }` para que la app padre pueda leer el estado en cualquier momento.
* `simulador.destroy()`: Limpia listeners del DOM y destruye la instancia de Chart.js para evitar fugas de memoria en SPAs (React, Vue, Angular, Vanilla).

### 4.4 Eventos DOM Emitidos (`CustomEvent`)

Además de los callbacks, el elemento contenedor emite eventos que burbujean (`bubbles: true`):
* `tco:calculado` — `detail: { payload, data, contexto }`
* `tco:payback-calculado` — `detail: { data }`
* `tco:reset` — Disparado cuando hay un error de validación o se reinicia el formulario.

---

## 5. Especificación del Motor de Cálculo en JavaScript

Todos los cálculos deben implementarse en aritmética de punto flotante estándar (`Number`) manteniendo la estructura exacta de salida y **preservando los comportamientos literales** documentados en el sistema original.

### 5.1 `FormatoEs.js` (Frontera Numérica)

* `esDecimalValido(valor)`:
  * Evalúa cadenas de entrada del usuario antes de parsear. Solo acepta `/^\d+(,\d{1,2})?$/` (sin puntos ni espacios).
* `parseDecimalEs(valor)`:
  * Si recibe `number`, lo devuelve directamente si es finito.
  * Si recibe `string`, elimina puntos de miles (`.`), verifica estrictamente `/^\d+(,\d{1,2})?$/` y reemplaza `,` por `.`. Si no cumple, lanza un `ValidationError`.
* `fmtEs(numero, decimales = 2)`:
  * Redondea a `decimales` y formatea usando `.` como separador de miles y `,` como separador decimal (ej. `1.200,00`).

### 5.2 `TintaService.js`

* `costoMlPromedio(tintas, legadoPvp, legadoVolumen, dtoPct = 0)`:
  1. Calcula `factor = 1 - (dtoPct / 100)`.
  2. Filtra `tintas` donde `volumen_ml > 0`.
  3. Si existen tintas válidas, calcula para cada una `(pvp * factor) / volumen_ml` y retorna el **promedio aritmético simple**.
  4. Si no existen, retorna `(legadoPvp * factor) / legadoVolumen` (si `legadoVolumen > 0`), o `0.0`.

* `costoMlMaximo(tintas, legadoPvp, legadoVolumen, dtoPct = 0)`:
  1. Aplica el mismo `factor` de descuento.
  2. Retorna el **mayor** `(pvp * factor) / volumen_ml` entre las tintas válidas.
  3. Si no hay tintas válidas, usa el fallback legacy. La UI usa este valor para el costo de tinta del TCO.

### 5.3 `TCOCalculator.js` (Fórmulas Exactas)

El método `calcularTCO(params)` ejecuta exactamente las siguientes ecuaciones:

1. **Validaciones previas** (lanzan `ValidationError` con mensajes idénticos al backend original):
   * `metros_mes <= 0` $\rightarrow$ `"Metros/mes debe ser mayor a 0"`
   * `pct_desperdicio < 0 || pct_desperdicio >= 100` $\rightarrow$ `"pct_desperdicio debe estar en [0,100)"`
   * `desperdicio_sustrato_pct < 0 || desperdicio_sustrato_pct >= 100` $\rightarrow$ `"desperdicio_sustrato_pct debe estar en [0,100)"`
   * `volumen_tinta <= 0` $\rightarrow$ `"Volumen de tinta debe ser mayor a 0"`

2. **Costos Variables Unitarios (`cvu_m2`)**:
   * **Tinta**:
     $$\text{costoTintaMl} = \text{precio\_tinta\_ml definido} \;?\; \text{precio\_tinta\_ml} : \frac{\text{precioTinta}}{\text{volumenTinta}}, \quad \text{costoTintaM2} = \text{consumoMlM2} \times \text{costoTintaMl}$$
     * `precio_tinta_ml` es el mayor costo por ml entre las tintas del equipo, con el descuento de la variante aplicado. Si la UI lo envía (incluso `0` por descuento del 100%), tiene prioridad sobre el cálculo legacy.
   * **Energía** *(Comportamiento literal: base fija de 720 horas/mes; `horas_dia` no interviene en el TCO, solo en `contexto.costo_diario_usd`)*:
     $$\text{horasImpresionMes} = \frac{\text{metrosMes}}{\text{metrosHora}}, \quad \text{horasStandbyMes} = \max(720 - \text{horasImpresionMes}, 0)$$
     $$\text{costoEnergiaM2} = \frac{((\text{horasImpresionMes} \times \text{powerPrint}) + (\text{horasStandbyMes} \times \text{powerStby})) \times \text{costoKwh}}{\text{metrosMes}}$$
   * **Sustrato y Desperdicio de Sustrato**:
     $$\text{costoPapelM2} = \frac{\text{valorRollo}}{\text{anchoPapel} \times \text{longitudPapel}}, \quad \text{costoSustratoDespM2} = \left(\frac{\text{despSust}}{100}\right) \times \text{costoPapelM2}$$
   * **Consumibles, Cabezal y Desperdicio de Tinta**:
     $$\text{costoConsumiblesMensual} = \sum \frac{(\text{pvp}_i \times \text{cantidad}_i) \times 30}{\text{vidaUtilDias}_i}$$
     $$\text{costoCabezalMensual} = \frac{\text{valorCabezal} \times \text{numCabezales}}{\text{tiempoCambioMeses}}$$
     $$\text{costoDesperdicioTintaMensual} = \left(\sum \text{volumenMl}_i\right) \times \left(\frac{\text{pctDesperdicio}}{100}\right) \times \max_i\left(\frac{\text{pvp}_i \times \text{factorDto}}{\text{volumenMl}_i}\right)$$
     *(Nota literal: `costos_variables_mensual.total` suma únicamente `consumibles + cabezal`, manteniendo `desperdicio_tinta` como clave separada pero sumándolo al `cvu_m2` unitario).*
   * **Total CVU**:
     $$\text{cvu\_m2} = \text{costoTintaM2} + \text{costoEnergiaM2} + \text{costoPapelM2} + \text{costoSustratoDespM2} + \frac{\text{costoConsumiblesMensual} + \text{costoCabezalMensual} + \text{costoDesperdicioTintaMensual}}{\text{metrosMes}} + \text{otroFactor}$$

3. **Costos Fijos Unitarios (`costo_fijo_unitario`) y TCO Total**:
   $$\text{depreciacionMensual} = \frac{\text{valorEquipo}}{\text{mesesDepreciacion}}, \quad \text{costoCoverPlusMensual} = \frac{\text{pvpCoverPlus}}{12}$$
   $$\text{costosFijosMensual} = \text{costoMoMensual} + \text{arrendamientoMensual} + \text{depreciacionMensual} + \text{costoCoverPlusMensual}$$
   $$\text{costo\_fijo\_unitario} = \frac{\text{costosFijosMensual}}{\text{metrosMes}}, \quad \text{tco\_total\_m2} = \text{cvu\_m2} + \text{costo\_fijo\_unitario}$$

### 5.4 `PaybackService.js`

* **Pricing y Margen** (con `base = 'tco'`):
  $$\text{precioVentaM2} = \frac{\text{tco\_total\_m2}}{1 - \text{margen}}, \quad \text{ingresoMensual} = \text{precioVentaM2} \times \text{metrosMes}$$
  $$\text{margenMensual} = \text{ingresoMensual} - (\text{cvu\_m2} \times \text{metrosMes}) - \text{costosFijosMensual}$$
* **Cálculo de PayBack (Simple y Descontado)**:
  * Tasa mensual: $r = \frac{\text{tasaAnualPct}}{12 \times 100}$.
  * Si `inversion <= 0` $\rightarrow$ `0.0` (`"Sin inversión"`).
  * Si `margenMensual <= 0` $\rightarrow$ `null` (`"Sin retorno"`).
  * Itera $n = 1 \dots 720$ acumulando $\text{flujo}_n = \frac{\text{margenMensual}}{(1 + r)^n}$. Cuando $\text{acum}_n \ge 0$, interpola linealmente:
    $$\text{meses} = (n - 1) + \frac{-\text{acum}_{n-1}}{\text{flujo}_n}$$
  * Si tras 720 meses no recupera, retorna `null` (`"Mayor a 60 meses"`).
* **Serie para Chart.js**:
  * Horizonte: `Math.ceil(globales.meses_depreciacion || 60)`.
  * Genera arreglos paralelos `meses` (`0..horizonte`), `simple` y `descontado` iniciando en `-inversion`.

---

## 6. Diseño del Frontend (HTML5 + Bootstrap 5 + Chart.js)

### 6.1 Estructura Visual y Componentes Bootstrap 5

El diseño abandona AdminLTE 3 y utiliza componentes nativos de **Bootstrap 5.3+** con clases encapsuladas bajo el prefijo `.ct-tco-*` para evitar colisiones de CSS con la aplicación anfitriona:

1. **Fila Superior de KPIs (`<section aria-label="Resumen del equipo">`)**:
   * Una sola tarjeta: **Uso de tinta** (`ml/m²` o `ml/Und` según el equipo).
   * La tarjeta muestra el consumo efectivo: la suma del uso por color si el usuario lo definió; en caso contrario, el consumo del modo seleccionado.
   * Botón de edición (ícono lápiz) en la esquina superior derecha que abre el modal **Uso de tinta por color**.
2. **Panel de Configuración y Formulario (`<form id="ct-form-tco" novalidate>`)**:
   * No hay selector de equipo: el simulador carga exclusivamente el equipo que se está revisando (`equipoInicialId`).
   * Selectores en cascada `#ct-sim-variante`, `#ct-sim-modo`, `#ct-sim-papel`.
   * Inputs numéricos con `inputmode="decimal"` y clase `.ct-campo-decimal`: `#ct-sim-metros-mes` y `#ct-sim-horas-dia`.
   * Botón primario `#ct-btn-calcular` ("Calcular Costo"). El botón "Guardar escenario" fue retirado.
3. **Modal “Uso de tinta por color” (`#ct-modal-uso-tinta`)**:
   * Se abre desde el botón editar de la tarjeta KPI y se construye dentro del módulo TCO.
   * Los campos se derivan de `ink_skus` del equipo (colores distintos, en orden de aparición); si no existe, usa `tintas[].color_code`.
   * Cada fila: círculo con el HEX de `colors.js` (`window.PRICELIST_COLORS`), código de color (ej. `C`), input decimal (`1,5`) y unidad (`ml/m²` o `ml/Und`).
   * Acciones: **Cancelar**, **Usar consumo del modo** (limpia el uso personalizado) y **Guardar**. El total se actualiza en vivo.
   * Si el total por color es `0`, el cálculo usa el consumo del modo seleccionado.
4. **Zona de Resultados (`<div id="ct-resultados" aria-live="polite" aria-atomic="true">`)**:
   * **Alertas de Validación**: Renderizadas mediante `alert alert-danger` usando creación segura de nodos DOM (`textContent`, prevención XSS).
   * **Tabla de Desglose (`#ct-tabla-desglose`)**: Envuelta en `<div class="table-responsive" role="region" aria-label="Desglose de costos" tabindex="0">`. Usa `table table-sm table-hover align-middle` con encabezados agrupados para **Costos Variables** (Subtotal CVU), **Costos Fijos** (Subtotal CFU) y fila destacada (`table-primary fw-bold`) para **Costo Total Unitario** (`100,0%`).
   * **Tarjeta de Consumo Mensual de Tinta (`#ct-card-consumo-tinta`)**: Visible solo cuando existe uso de tinta por color definido. Muestra tabla con Tinta, Consumo, Rendimiento y Estimado (`Litros/mes`).
4. **Panel Interactivo de PayBack Descontado (`#ct-card-payback`)**:
   * Inicialmente oculto (`d-none`); se muestra al emitirse `tco:calculado`.
   * Controles con `input-group` de Bootstrap para **Margen (%)** (default `30`, paso `0,5`, rango `[0, 95]`) y **Tasa Descuento Anual (%)** (default `6,5`, paso `0,5`, rango `[0, 100]`) con botones `-` y `+` accesibles (`aria-label`).
   * Ejecución instantánea en cliente con *debounce* de `350 ms`.
   * 4 mini-KPIs: Inversión inicial, Volumen mensual, Margen mensual (`USD`) y Retorno ROI (`Math.ceil(meses)` o indicador `"Sin retorno"` / `"> N meses"`).
   * Contenedor de gráfico (`<div style="position: relative; height: 280px;">`) con `<canvas id="ct-payback-chart" role="img" aria-label="Evolución del PayBack descontado"></canvas>`.

### 6.2 Especificación del Gráfico (`ChartManager.js`)

Utiliza **Chart.js v4**:
* **Tipo**: `line` con `responsive: true` y `maintainAspectRatio: false`.
* **Dataset 1 (Flujo Acumulado Descontado)**: Línea continua (`tension: 0.2`), relleno condicional bajo cero/sobre cero, puntos en cada mes del horizonte (`0` a `meses_depreciacion`).
* **Dataset 2 (Punto de Equilibrio / Retorno)**: Renderizado cuando `payback_descontado !== null` como un punto destacado (`pointRadius: 6`, `pointStyle: 'circle'`) en las coordenadas `{ x: payback_descontado, y: 0 }`.
* **Línea de referencia `y = 0`**: Destacada visualmente en la grilla del eje Y (`grid.color` diferenciado en valor `0`).
* **Tooltips y Ejes**: Formateados en tiempo real usando `FormatoEs.fmtEs()` con prefijo `USD `.
* **Gestión de ciclo de vida**: Antes de redibujar o al desmontar el módulo, invoca `chartInstance.destroy()` para evitar superposición de canvas.

---

## 7. Accesibilidad (WCAG 2.1 AA) y Seguridad Client-Side

1. **Regiones Vivas (`ARIA`)**: `#ct-resultados` anuncia errores y actualizaciones de cálculo mediante `aria-live="polite"`.
2. **Navegación por Teclado**: Todas las tablas responsivas poseen `tabindex="0"` y `role="region"` para permitir desplazamiento horizontal con flechas de teclado. Los estados `:focus-visible` utilizan el anillo de enfoque de Bootstrap 5 sin suprimirlo.
3. **Etiquetado Semántico**: Todos los controles de formulario (`<select>`, `<input>`, botones `±`) cuentan con `<label for="...">` explícito o `aria-label` descriptivo.
4. **Prevención de XSS**: Al recibir un catálogo JSON dinámico desde la aplicación anfitriona, ningún nombre de equipo, modo, sustrato o color se inserta mediante `innerHTML` sin escapar; se emplea `document.createElement` + `textContent` de forma sistemática.

---

## 8. Matriz de Pruebas Unitarias (QA del Motor JS)

Para certificar que la migración de PHP a JavaScript no introduce desviaciones numéricas, se debe incluir una suite de pruebas (Jest o Vitest) con tolerancia $\epsilon = 0.0001$:

1. **Paridad de Fórmulas TCO**: Replicar exactamente el caso base de `TCOCalculatorTest.php` (`precio_tinta=92.183`, `volumen_tinta=800`, `consumo_ml_m2=8.86`, `metros_mes=1200`, `valor_equipo=14500`, etc.) verificando que `cvu_m2`, `costo_fijo_unitario` y `tco_total_m2` coincidan hasta el cuarto decimal.
2. **Reglas de Negocio Literales**:
   * Verificar que `horas_dia` modifica `contexto.costo_diario_usd` pero **no altera** `costo_energia_m2` (base 720h).
   * Verificar que `costos_variables_mensual.total` excluye `desperdicio_tinta`, mientras `cvu_m2` sí lo incluye.
   * Verificar el etiquetado `Und`, `Und/h`, `ml/Und` cuando `tipo === 'DTG'`.
3. **Paridad de PayBack**: Replicar el caso de `PaybackServiceTest.php` (`inversion=9211`, `tco=3.7948`, `Q=1600`, `margen=30%`, `tasa_anual=6.5%`) validando `payback_simple`, `payback_descontado` y la serie acumulada.
4. **Validación de Formato Español**: Probar que entradas con punto decimal (`"6.5"`) o puntos de miles (`"1.200,00"`) en inputs crudos sean rechazadas por `esDecimalValido()` con el mensaje reglamentario, mientras que `"1200,50"` sea aceptado y parseado a `1200.5`.