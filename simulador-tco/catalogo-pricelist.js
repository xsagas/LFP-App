(function (global) {
  'use strict';

  // Configuración TCO por modelo de PriceList.
  // Únicos valores por defecto: las unidades de medida. El resto de datos técnicos
  // (tipo, modos, potencias, cabezales, vida útil, papeles, consumibles…) debe estar
  // definido en el perfil de cada equipo o en `model.tco`.
  // Los precios de equipo y tintas se sincronizan desde los datos vigentes de PriceList al construir el catálogo.
  const TCO_MODEL_DEFAULTS = {
    _default: {
      unidad: 'm²', unidad_velocidad: 'm²/h', unidad_consumo: 'ml/m²'
    },
    'surecolor-f170': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Estándar',velocidad_m2h:8.4,consumo_ml_m2:12}], power_print:0.22, power_stby:0.012 },
	
    'surecolor-f570': { tipo: 'RollToRoll', 
						modos: [
						{id:1,orden:1,nombre:'7 Pasadas',velocidad_m2h:11.5,consumo_ml_m2:5},
						{id:2,orden:2,nombre:'12 Pasadas',velocidad_m2h:8.5,consumo_ml_m2:6.5}
						], 
						power_print: 0.2, power_stby: 0.03, 
						pct_desperdicio: 1.0, num_cabezales: 1,
						pvp_cabezal: 800, vida_util_meses: 36,
						pvp_coverplus: 0,
						papeles: [{ id: 1, nombre: 'DS Transfer 90gr', categoria: 'Textil', costo: 25, ancho: 0.6, longitud: 30, desperdicio_pct: 3 }],
						consumibles: []},
	
    'surecolor-f6470': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:18.5,consumo_ml_m2:8.86},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:10,consumo_ml_m2:12}], power_print:0.35, power_stby:0.03 },
    'surecolor-f6470h': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:17,consumo_ml_m2:9.5},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:9,consumo_ml_m2:13}], power_print:0.38, power_stby:0.03 },
    'surecolor-f9570': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:25,consumo_ml_m2:9},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:14,consumo_ml_m2:12}], power_print:0.5, power_stby:0.04 },
    'surecolor-f9570h': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:23,consumo_ml_m2:9.5},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:13,consumo_ml_m2:12.5}], power_print:0.52, power_stby:0.04 },
    'surecolor-f1070': { tipo: 'DTG', unidad:'Und', unidad_velocidad:'Und/h', unidad_consumo:'ml/Und', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:25,consumo_ml_m2:4},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:15,consumo_ml_m2:6}], power_print:0.29, power_stby:0.02 },
    'surecolor-f2270': { tipo: 'DTG', unidad:'Und', unidad_velocidad:'Und/h', unidad_consumo:'ml/Und', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:30,consumo_ml_m2:5},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:18,consumo_ml_m2:7}], power_print:0.6, power_stby:0.03 },
    'surecolor-f3070': { tipo: 'DTG', unidad:'Und', unidad_velocidad:'Und/h', unidad_consumo:'ml/Und', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:60,consumo_ml_m2:5},{id:2,orden:2,nombre:'Calidad',velocidad_m2h:35,consumo_ml_m2:7}], power_print:1.2, power_stby:0.05 },
    'surecolor-f10070': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:255,consumo_ml_m2:6}], power_print:2.6, power_stby:0.1 },
    'surecolor-f11070hlr': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:255,consumo_ml_m2:6}], power_print:2.8, power_stby:0.1 },
    'surecolor-f20070': { tipo: 'RollToRoll', modos: [{id:1,orden:1,nombre:'Producción',velocidad_m2h:255,consumo_ml_m2:6}], power_print:3.0, power_stby:0.1 }
  };

  const GLOBALES_DEFAULT = {
    costo_mo_mensual: 964.30,
    arrendamiento_mensual: 0.0,
    meses_depreciacion: 60.0,
    tiempo_cambio_meses: 36.0,
    costo_kwh: 0.23,
    pct_desperdicio: 1.0,
    metros_mes_default: 1200.0,
    horas_dia_default: 4.0
  };

  // Busca el perfil técnico por ID exacto y, si no existe, sin distinguir mayúsculas
  // (los IDs de data.js pueden venir como `surecolor-S7170` y el perfil como `surecolor-s7170`).
  function getModelProfile(id) {
    if (id == null) return null;
    const key = String(id);
    if (Object.prototype.hasOwnProperty.call(TCO_MODEL_DEFAULTS, key)) return TCO_MODEL_DEFAULTS[key];
    const lower = key.toLowerCase();
    const found = Object.keys(TCO_MODEL_DEFAULTS).find((k) => k.toLowerCase() === lower);
    return found ? TCO_MODEL_DEFAULTS[found] : null;
  }

  // Mezcla profunda de N fuentes, de izquierda a derecha (la última gana).
  function deepMerge() {
    const sources = Array.prototype.slice.call(arguments);
    const out = {};
    sources.forEach((src) => {
      if (!src) return;
      Object.keys(src).forEach((k) => {
        const v = src[k];
        if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
          out[k] = deepMerge(out[k], v);
        } else {
          out[k] = Array.isArray(v) ? v.slice() : v;
        }
      });
    });
    return out;
  }

  function inferColorCode(name, idx) {
    const n = String(name || '').toUpperCase();
    if (n.includes('CYAN') || /\bC\b/.test(n)) return 'C';
    if (n.includes('MAGENTA') || /\bM\b/.test(n)) return 'M';
    if (n.includes('YELLOW') || /\bY\b/.test(n)) return 'Y';
    if (n.includes('BLACK') || /\bK\b|PK|MK/.test(n)) return 'K';
    if (n.includes('BLANCO') || n.includes('WHITE') || /\bW\b/.test(n)) return 'W';
    if (n.includes('VARNISH')) return 'Vr';
    return 'T' + (idx + 1);
  }

  function buildEquipoFromModel(model, cfg, sustratos) {
    const profileId = model.tco_profile_id || model.id;
    const profile = cfg || getModelProfile(profileId) || {};
    const base = deepMerge(TCO_MODEL_DEFAULTS._default, profile, (model.tco && typeof model.tco === 'object') ? model.tco : {});
    const isDtg = base.tipo === 'DTG';
    const inks = Array.isArray(model.inks) ? model.inks : [];
    const tintas = inks.map((ink, i) => ({
      color_code: inferColorCode(ink.name, i),
      volumen_ml: Number(ink.capacity_ml) || 0,
      pvp: Number(ink.price_usd != null ? ink.price_usd : ink.price) || 0
    })).filter((t) => t.volumen_ml > 0);

    // variantes desde modelo canónico (variants) o legacy (plans) o base
    const rawVariants = Array.isArray(model.variants) && model.variants.length
      ? model.variants
      : (Array.isArray(model.plans) && model.plans.length ? model.plans : []);
    const basePrice = Number(model.base_price_usd != null ? model.base_price_usd : model.printer_price) || 0;
    let variantes = [];
    if (rawVariants.length) {
      variantes = rawVariants.map((p, i) => {
        const rawPrice = p.price_usd != null ? p.price_usd : p.price;
        const price = rawPrice != null && rawPrice !== '' ? Number(rawPrice) : NaN;
        const dto = Number(p.ink_discount_pct != null ? p.ink_discount_pct : p.ink_discount) || 0;
        return {
          id: p.id != null ? p.id : i,
          variant_id: p.id != null ? String(p.id) : String(i),
          orden: i + 1,
          modelo: p.label || ('Plan ' + (i + 1)),
          pvp_equipo: Number.isFinite(price) && price > 0 ? price : basePrice,
          dto_tinta_pct: dto,
          precio_tinta: tintas[0] ? tintas[0].pvp : 0,
          precio_tinta_ml: (tintas[0] && tintas[0].volumen_ml) ? (tintas[0].pvp / tintas[0].volumen_ml) : 0
        };
      });
    } else {
      variantes = [{
        id: 'base',
        variant_id: 'base',
        orden: 1,
        modelo: 'Base',
        pvp_equipo: basePrice,
        dto_tinta_pct: 0,
        precio_tinta: tintas[0] ? tintas[0].pvp : 0,
        precio_tinta_ml: (tintas[0] && tintas[0].volumen_ml) ? (tintas[0].pvp / tintas[0].volumen_ml) : 0
      }];
    }

    // Sin datos técnicos por defecto: lo que no esté definido para el equipo queda vacío/0.
    return {
      id: model.id,
      otra_marca: false,
      modelo: model.name,
      tipo: base.tipo || '',
      unidad: isDtg ? 'Und' : (base.unidad || 'm²'),
      unidad_velocidad: isDtg ? 'Und/h' : (base.unidad_velocidad || 'm²/h'),
      unidad_consumo: isDtg ? 'ml/Und' : (base.unidad_consumo || 'ml/m²'),
      pvp_equipo: basePrice,
      pct_desperdicio: Number(base.pct_desperdicio) || 0,
      num_cabezales: Number(base.num_cabezales) || 0,
      pvp_cabezal: Number(base.pvp_cabezal) || 0,
      vida_util_meses: Number(base.vida_util_meses) || 0,
      power_print: Number(base.power_print) || 0,
      power_stby: Number(base.power_stby) || 0,
      pvp_coverplus: Number(base.pvp_coverplus) || 0,
      variantes: variantes,
      modos: (Array.isArray(base.modos) ? base.modos : []).map((m, i) => ({
        id: m.id != null ? m.id : (i + 1),
        orden: m.orden != null ? m.orden : (i + 1),
        nombre: m.nombre || ('Modo ' + (i + 1)),
        velocidad_m2h: Number(m.velocidad_m2h) || 0,
        consumo_ml_m2: Number(m.consumo_ml_m2) || 0
      })),
      papeles: (function(){
        // Prioridad: papeles definidos en el perfil del equipo (o `model.tco`).
        // El catálogo global de sustratos se usa solo si el equipo no define papeles.
        const src = (Array.isArray(base.papeles) && base.papeles.length)
          ? base.papeles
          : (Array.isArray(sustratos) ? sustratos : []);
        return src.map((p, i) => {
          const costo = Number(p.precio_usd != null ? p.precio_usd : p.costo) || 0;
          const ancho = Number(p.ancho_m != null ? p.ancho_m : p.ancho) || 0;
          const longitud = Number(p.longitud_m != null ? p.longitud_m : p.longitud) || 0;
          return {
            id: p.id != null ? p.id : (i + 1),
            substrate_id: p.id != null ? String(p.id) : null,
            nombre: p.nombre || ('Sustrato ' + (i + 1)),
            categoria: p.categoria || 'General',
            costo,
            ancho,
            longitud,
            desperdicio_pct: Math.min(99.99, Math.max(0, Number(p.desperdicio_pct) || 0))
          };
        });
      })(),
      inks: inks.map((ink) => ({
        id: ink.id,
        name: ink.name,
        capacity_ml: Number(ink.capacity_ml) || 0,
        price_usd: Number(ink.price_usd != null ? ink.price_usd : ink.price) || 0
      })),
      tintas: tintas,
      ink_skus: Array.isArray(model.ink_skus)
        ? model.ink_skus
        : (Array.isArray(model.inks_sku) ? model.inks_sku : []),
      consumibles: Array.isArray(base.consumibles) ? base.consumibles : []
    };
  }

  function buildTcoCatalog(priceListModels, options) {
    const opts = options || {};
    const models = Array.isArray(priceListModels) ? priceListModels : [];
    const globales = deepMerge(GLOBALES_DEFAULT, opts.globales || {});
    const sustratos = Array.isArray(opts.sustratos) ? opts.sustratos : null;
    const equipos = models.map((m) => buildEquipoFromModel(m, getModelProfile(m.tco_profile_id || m.id), sustratos));
    return { globales, equipos, equiposOtras: [] };
  }

  global.SIMULADOR_TCO_CONFIG = {
    GLOBALES_DEFAULT,
    TCO_MODEL_DEFAULTS,
    buildTcoCatalog,
    buildEquipoFromModel
  };
})(window);
