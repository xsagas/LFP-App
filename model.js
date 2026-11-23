(function (global) {
  'use strict';

  function slugify(value, fallback) {
    const s = String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || fallback || 'item';
  }

  function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (def == null ? 0 : def);
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function toBool(value, fallback) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
      const s = value.trim().toLowerCase();
      if (s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí') return true;
      if (s === 'false' || s === '0' || s === 'no') return false;
    }
    return fallback == null ? false : fallback;
  }

  function uniqueId(base, used) {
    let id = base || 'item';
    if (!used.has(id)) { used.add(id); return id; }
    let i = 2;
    while (used.has(id + '-' + i)) i += 1;
    id = id + '-' + i;
    used.add(id);
    return id;
  }

  function normalizeInk(raw, index, usedIds) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const name = String(src.name == null ? ('Tinta ' + (index + 1)) : src.name).trim() || ('Tinta ' + (index + 1));
    const id = uniqueId(String(src.id || '').trim() || slugify(name, 'ink-' + (index + 1)), usedIds);
    const price = num(src.price_usd != null ? src.price_usd : src.price, 0);
    const capacity = num(src.capacity_ml, 0);
    const out = {
      id,
      name,
      price_usd: price > 0 ? price : 0,
      capacity_ml: capacity > 0 ? capacity : 0
    };
    if (src.sku) out.sku = String(src.sku);
    out.price = out.price_usd; // legacy alias
    return out;
  }

  function normalizeInkSkuGroups(rawList, usedIds) {
    const list = Array.isArray(rawList) ? rawList : [];
    return list.map((raw, i) => {
      const src = raw && typeof raw === 'object' ? raw : {};
      const rawTag = src.tag != null ? src.tag : src.capacity != null ? src.capacity : src.id;
      const tag = String(rawTag == null ? '' : rawTag).trim();
      const id = uniqueId(String(src.id || '').trim() || slugify(tag, 'grupo-' + (i + 1)), usedIds);
      const inksRaw = Array.isArray(src.inks) ? src.inks : (Array.isArray(src.items) ? src.items : []);
      const inks = inksRaw.map((inkRaw) => {
        const ink = inkRaw && typeof inkRaw === 'object' ? inkRaw : {};
        return {
          sku: String(ink.sku != null ? ink.sku : ink.SKU != null ? ink.SKU : '').trim(),
          color: String(ink.color != null ? ink.color : ink.ink != null ? ink.ink : '').trim()
        };
      }).filter((ink) => ink.sku || ink.color);
      return { id, tag: tag || id, inks };
    }).filter((group) => group.inks.length);
  }

  function normalizeVariant(raw, index, model, usedIds) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const label = String(src.label == null ? src.name == null ? ('Variante ' + (index + 1)) : src.name : src.label).trim() || ('Variante ' + (index + 1));
    const id = uniqueId(String(src.id || '').trim() || slugify(label, 'variant-' + (index + 1)), usedIds);
    const rawPrice = src.price_usd != null ? src.price_usd : src.price;
    const price = rawPrice == null || rawPrice === '' ? null : num(rawPrice, null);
    const discountRaw = src.ink_discount_pct != null ? src.ink_discount_pct : src.ink_discount;
    const out = {
      id,
      label,
      price_usd: (price != null && Number.isFinite(price) && price > 0) ? price : null,
      ink_discount_pct: clamp(num(discountRaw, 0), 0, 100),
      is_default: !!src.is_default || index === 0
    };
    if (src.plan != null && String(src.plan).trim()) out.plan = String(src.plan).trim();
    if (src.notes != null && String(src.notes).trim()) out.notes = String(src.notes);
    if (src.availability === 'hidden' || src.availability === 'active') out.availability = src.availability;
    // preserve legacy: if variant had no explicit price but model base exists, keep null (inherits base)
    if (out.price_usd == null && index === 0 && Number.isFinite(num(model.base_price_usd, NaN))) {
      // keep null to inherit base; display logic can show base
    }
    return out;
  }

  function normalizeModel(raw, index) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const warnings = [];
    const name = String(src.name == null ? ('Modelo ' + (index + 1)) : src.name).trim() || ('Modelo ' + (index + 1));
    const id = String(src.id == null ? '' : src.id).trim() || slugify(name, 'model-' + (index + 1));
    const basePrice = num(src.base_price_usd != null ? src.base_price_usd : src.printer_price, 0);
    const fairRaw = src.fair_price_usd != null ? src.fair_price_usd : src.fair_price;
    const fair = num(fairRaw, 0);

    const inkIds = new Set();
    const inks = Array.isArray(src.inks) ? src.inks.map((ink, i) => normalizeInk(ink, i, inkIds)) : [];

    const variantIds = new Set();
    const rawVariants = Array.isArray(src.variants) ? src.variants : (Array.isArray(src.plans) ? src.plans : []);
    let variants = rawVariants.map((v, i) => normalizeVariant(v, i, { base_price_usd: basePrice }, variantIds));
    if (!variants.length) {
      variants = [{ id: 'base', label: 'Base', price_usd: null, ink_discount_pct: 0, is_default: true }];
    }
    // ensure exactly one default; first default wins, else first
    let defaultSeen = false;
    variants = variants.map((v) => {
      if (v.is_default && !defaultSeen) { defaultSeen = true; return v; }
      return { ...v, is_default: false };
    });
    if (!defaultSeen) variants[0] = { ...variants[0], is_default: true };

    const rawAccessories = Array.isArray(src.accessories) ? src.accessories : (Array.isArray(src.accesories) ? src.accesories : []);
    const accessories = rawAccessories.map((a, i) => {
      const item = a && typeof a === 'object' ? a : {};
      const label = String(item.label == null ? item.name == null ? ('Accesorio ' + (i + 1)) : item.name : item.label).trim() || ('Accesorio ' + (i + 1));
      return {
        id: String(item.id || '').trim() || slugify(label, 'acc-' + (i + 1)),
        label,
        price_usd: num(item.price_usd != null ? item.price_usd : item.price, 0),
        sku: String(item.sku != null ? item.sku : item.SKU != null ? item.SKU : '').trim()
      };
    });

    const rawInkSkus = src.inks_sku != null ? src.inks_sku : src.ink_skus;
    const inkSkus = normalizeInkSkuGroups(rawInkSkus, new Set());

    const netPrice = num(src.net_price_usd != null ? src.net_price_usd : src.net_price != null ? src.net_price : src.canal, 0);
    const markupRaw = src['markup_%'] != null ? src['markup_%'] : src.markup_pct != null ? src.markup_pct : src.markup_percent != null ? src.markup_percent : src.markup;
    const markupPct = num(markupRaw, NaN);
    // `tco` puede ser booleano/'true'/'false' (habilita el simulador) u objeto (config técnica).
    const tcoEnabled = src.tco_enabled != null
      ? toBool(src.tco_enabled, false)
      : (src.tco != null && typeof src.tco !== 'object' ? toBool(src.tco, false) : false);

    const model = {
      id,
      name,
      category: String(src.category || src.catogory || '').trim(),
      net_price_usd: netPrice > 0 ? netPrice : 0,
      markup_pct: Number.isFinite(markupPct) ? markupPct : 0,
      tco_enabled: tcoEnabled,
      base_price_usd: basePrice > 0 ? basePrice : 0,
      fair_price_usd: fair > 0 ? fair : 0,
      inks,
      ink_skus: inkSkus,
      variants,
      accessories,
      notes: src.notes == null ? '' : String(src.notes)
    };
    if (src.tco_profile_id) model.tco_profile_id = String(src.tco_profile_id);
    if (src.tco && typeof src.tco === 'object') model.tco = JSON.parse(JSON.stringify(src.tco));

    // Legacy aliases for incremental migration
    model.printer_price = model.base_price_usd;
    model.fair_price = model.fair_price_usd;
    model.plans = model.variants.map((v) => ({
      id: v.id,
      label: v.label,
      price: v.price_usd,
      ink_discount: v.ink_discount_pct,
      notes: v.notes || '',
      is_default: !!v.is_default
    }));

    if (!model.id) warnings.push('Modelo sin id');
    if (!model.name) warnings.push('Modelo sin nombre');
    if (!(model.base_price_usd > 0)) warnings.push('Modelo ' + model.id + ': base_price_usd inválido');
    if (!model.inks.length) warnings.push('Modelo ' + model.id + ': sin tintas');
    model._warnings = warnings;
    return model;
  }

  function normalizeModels(list) {
    const usedModelIds = new Set();
    const out = [];
    const warnings = [];
    (Array.isArray(list) ? list : []).forEach((raw, i) => {
      const model = normalizeModel(raw, i);
      model.id = uniqueId(model.id, usedModelIds);
      (model._warnings || []).forEach((w) => warnings.push(w));
      delete model._warnings;
      out.push(model);
    });
    return { models: out, warnings };
  }

  function getDefaultVariant(model) {
    const variants = model && Array.isArray(model.variants) ? model.variants : [];
    return variants.find((v) => v && v.is_default) || variants[0] || { id: 'base', label: 'Base', price_usd: null, ink_discount_pct: 0, is_default: true };
  }

  function getVariantById(model, variantId) {
    const variants = model && Array.isArray(model.variants) ? model.variants : [];
    return variants.find((v) => v && v.id === variantId) || null;
  }

  function getEffectivePrice(model, variant) {
    const v = variant || getDefaultVariant(model);
    const p = v && v.price_usd != null ? num(v.price_usd, NaN) : NaN;
    if (Number.isFinite(p) && p > 0) return p;
    const base = num(model && model.base_price_usd, 0);
    return base > 0 ? base : 0;
  }

  function getEffectiveInkDiscount(model, variant) {
    const v = variant || getDefaultVariant(model);
    return clamp(num(v && v.ink_discount_pct, 0), 0, 100);
  }

  function getDiscountedInks(model, variant) {
    const discount = getEffectiveInkDiscount(model, variant);
    const factor = 1 - discount / 100;
    return (model && Array.isArray(model.inks) ? model.inks : []).map((ink) => {
      const base = num(ink.price_usd, 0);
      const price = base * factor;
      return {
        ...ink,
        price_usd: price,
        price: price, // legacy alias for existing UI during migration
        base_price_usd: base,
        price_per_ml: ink.capacity_ml ? price / ink.capacity_ml : null,
        price_old_usd: factor === 1 ? null : base
      };
    });
  }

  // Legacy-compatible accessors for migration
  function syncLegacyAliases(model) {
    if (!model) return model;
    model.printer_price = num(model.base_price_usd, 0);
    model.fair_price = num(model.fair_price_usd, 0);
    model.inks = (model.inks || []).map((ink) => {
      ink.price_usd = num(ink.price_usd != null ? ink.price_usd : ink.price, 0);
      ink.capacity_ml = num(ink.capacity_ml, 0);
      ink.price = ink.price_usd;
      return ink;
    });
    model.net_price_usd = num(model.net_price_usd != null ? model.net_price_usd : model.net_price != null ? model.net_price : model.canal, 0);
    if (model.tco_enabled != null) model.tco_enabled = toBool(model.tco_enabled, false);
    else if (model.tco != null && typeof model.tco !== 'object') model.tco_enabled = toBool(model.tco, false);
    else model.tco_enabled = false;
    const markupRaw = model.markup_pct != null ? model.markup_pct : model['markup_%'] != null ? model['markup_%'] : model.markup_percent != null ? model.markup_percent : model.markup;
    model.markup_pct = Number.isFinite(num(markupRaw, NaN)) ? num(markupRaw, 0) : 0;
    model.variants = (model.variants || []).map((v) => {
      v.ink_discount_pct = clamp(num(v.ink_discount_pct != null ? v.ink_discount_pct : v.ink_discount, 0), 0, 100);
      v.ink_discount = v.ink_discount_pct;
      if (v.price_usd == null && v.price != null && v.price !== '') v.price_usd = num(v.price, null);
      v.price = v.price_usd == null ? null : num(v.price_usd, 0);
      v.label = String(v.label == null ? '' : v.label);
      if (v.plan != null && String(v.plan).trim()) v.plan = String(v.plan).trim();
      v.is_default = !!v.is_default;
      return v;
    });
    model.plans = model.variants.map((v) => ({
      id: v.id,
      label: v.label,
      plan: v.plan || '',
      price: v.price_usd == null ? null : num(v.price_usd, 0),
      ink_discount: v.ink_discount_pct,
      notes: v.notes || '',
      is_default: !!v.is_default
    }));
    model.category = String(model.category || model.catogory || '').trim();
    const rawInkSkus = Array.isArray(model.ink_skus) ? model.ink_skus : (Array.isArray(model.inks_sku) ? model.inks_sku : []);
    model.ink_skus = normalizeInkSkuGroups(rawInkSkus, new Set());
    const rawAcc = Array.isArray(model.accessories) ? model.accessories : (Array.isArray(model.accesories) ? model.accesories : []);
    model.accessories = rawAcc.map((a, i) => {
      const item = a && typeof a === 'object' ? a : {};
      const label = String(item.label == null ? item.name == null ? ('Accesorio ' + (i + 1)) : item.name : item.label).trim() || ('Accesorio ' + (i + 1));
      return {
        id: String(item.id || '').trim() || slugify(label, 'acc-' + (i + 1)),
        label,
        price_usd: num(item.price_usd != null ? item.price_usd : item.price, 0),
        sku: String(item.sku != null ? item.sku : item.SKU != null ? item.SKU : '').trim()
      };
    });
    return model;
  }

  function toLegacyModel(model) {
    const m = JSON.parse(JSON.stringify(model || {}));
    syncLegacyAliases(m);
    return m;
  }

  function normalizeSubstrate(raw, index, usedIds) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const nombre = String(src.nombre == null ? src.name == null ? ('Sustrato ' + (index + 1)) : src.name : src.nombre).trim() || ('Sustrato ' + (index + 1));
    const categoria = String(src.categoria == null ? src.category == null ? 'General' : src.category : src.categoria).trim() || 'General';
    const id = uniqueId(String(src.id || '').trim() || slugify(categoria + '-' + nombre, 'sustrato-' + (index + 1)), usedIds || new Set());
    const longitud = num(src.longitud_m != null ? src.longitud_m : src.longitud, 0);
    const ancho = num(src.ancho_m != null ? src.ancho_m : src.ancho, 0);
    const precio = num(src.precio_usd != null ? src.precio_usd : src.precio != null ? src.precio : src.costo, 0);
    const desperdicio = clamp(num(src.desperdicio_pct != null ? src.desperdicio_pct : src.desperdicio, 0), 0, 99.99);
    const area = (ancho > 0 && longitud > 0) ? ancho * longitud : 0;
    return {
      id,
      categoria,
      nombre,
      longitud_m: longitud > 0 ? longitud : 0,
      ancho_m: ancho > 0 ? ancho : 0,
      precio_usd: precio >= 0 ? precio : 0,
      desperdicio_pct: desperdicio,
      activo: src.activo !== false,
      area_m2: area,
      costo_m2_usd: area > 0 ? precio / area : null
    };
  }

  function normalizeSubstrates(list) {
    const usedIds = new Set();
    const out = [];
    const warnings = [];
    (Array.isArray(list) ? list : []).forEach((raw, i) => {
      const s = normalizeSubstrate(raw, i, usedIds);
      if (!s.nombre) warnings.push('Sustrato sin nombre en índice ' + i);
      if (!(s.ancho_m > 0)) warnings.push('Sustrato ' + s.id + ': ancho inválido');
      if (!(s.longitud_m > 0)) warnings.push('Sustrato ' + s.id + ': longitud inválida');
      if (!(s.precio_usd >= 0)) warnings.push('Sustrato ' + s.id + ': precio inválido');
      out.push(s);
    });
    return { substrates: out, warnings };
  }

  function getSubstrateArea(s) { return num(s && s.ancho_m, 0) * num(s && s.longitud_m, 0); }
  function getSubstrateCostM2(s) {
    const area = getSubstrateArea(s);
    return area > 0 ? num(s && s.precio_usd, 0) / area : null;
  }
  function substrateToTcoPapel(s, index) {
    const src = s || {};
    return {
      id: src.id != null ? src.id : (index != null ? index + 1 : 1),
      nombre: String(src.nombre || 'Sustrato'),
      categoria: String(src.categoria || 'General'),
      costo: num(src.precio_usd != null ? src.precio_usd : src.costo, 0),
      ancho: num(src.ancho_m != null ? src.ancho_m : src.ancho, 0),
      longitud: num(src.longitud_m != null ? src.longitud_m : src.longitud, 0),
      desperdicio_pct: clamp(num(src.desperdicio_pct, 0), 0, 99.99)
    };
  }

  global.PriceListModel = {
    slugify,
    normalizeModel,
    normalizeModels,
    getDefaultVariant,
    getVariantById,
    getEffectivePrice,
    getEffectiveInkDiscount,
    getDiscountedInks,
    syncLegacyAliases,
    toLegacyModel,
    normalizeSubstrate,
    normalizeSubstrates,
    getSubstrateArea,
    getSubstrateCostM2,
    substrateToTcoPapel
  };
})(window);
