    'use strict';

    // CONFIGURACIÓN EDITABLE
    const HOME_ID = 'inicio';
    const LEGAL_NOTE = 'Los precios no incluyen IVA y están expresados en dólares (Usd).';


    // ELEMENTOS Y ESTADO GLOBAL
    const stage = document.getElementById('stage-scroll');
    const picker = document.getElementById('buttons');
    const pickerEl = document.getElementById('picker');

    let currency = 'USD';
    try { currency = localStorage.getItem('pl_currency') === 'COP' ? 'COP' : 'USD'; } catch(e) { currency = 'USD'; }
    let manualTrm = null;
    try {
      const v = Number(localStorage.getItem('pl_trm'));
      if (Number.isFinite(v) && v > 0) manualTrm = v;
    } catch(e) { manualTrm = null; }
    // Estado coherente: no se puede arrancar en COP sin una TRM válida.
    if (currency === 'COP' && !manualTrm) currency = 'USD';

    // Índice del plan/cobertura seleccionado en la card visible (se conserva al reconvertir moneda).
    let activePlanIndex = 0;
    let activeVariantId = null;
    let selectedCategory = 'all';
    // Instancia activa del simulador de costos (se destruye al cambiar de vista).
    let tcoInstance = null;

    const fmtUsd = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    const fmtUsdMl = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtCop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });
    const fmtCopMl = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 });

    function getTrm(){
      if (currency === 'COP' && Number.isFinite(manualTrm) && manualTrm > 0) return manualTrm;
      return null;
    }

    function formatAmount(usdAmount){
      const amount = Number(usdAmount) || 0;
      const trm = getTrm();
      const raw = (currency === 'COP' && trm) ? fmtCop.format(amount * trm) : fmtUsd.format(amount);
      return raw.replace(/\./g, '').replace(/USD|COP/g, (m) => m === 'USD' ? 'Usd' : 'Cop');
    }

    function formatAmountPerMl(usdPerMl){
      const amount = Number(usdPerMl);
      if (!Number.isFinite(amount)) return '—';
      const trm = getTrm();
      const raw = (currency === 'COP' && trm) ? fmtCopMl.format(amount * trm) : fmtUsdMl.format(amount);
      return raw.replace(/\./g, '').replace(/USD|COP/g, (m) => m === 'USD' ? 'Usd' : 'Cop') + ' / ml';
    }

    function fmtNum(n, decimals){
      const v = Number(n);
      if (!Number.isFinite(v)) return '—';
      const max = decimals != null ? decimals : 2;
      const fixed = Math.abs(v).toFixed(max);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '');
      const sign = v < 0 ? '-' : '';
      return sign + parts.join(',');
    }

    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
    const makeId = (name) => String(name ?? '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const normalize = (value) => String(value ?? '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();

    // Catálogo de colores (colors.js). Se referencia con guard porque `colors`
    // se declara con `const` y no queda expuesto en `window.colors`.
    const COLOR_MAP = (typeof colors !== 'undefined' && colors) ? colors : (window.PRICELIST_COLORS || {});
    const HEX_RE = /^#[0-9a-f]{3,8}$/i;

    function getColorInfo(code){
      const key = String(code == null ? '' : code).trim();
      if (!key) return { name: '—', hex: '#cccccc', defined: false };
      let entry = COLOR_MAP[key];
      if (!entry){
        const lower = key.toLowerCase();
        const found = Object.keys(COLOR_MAP).find((k) => k.toLowerCase() === lower);
        if (found) entry = COLOR_MAP[found];
      }
      const name = entry && entry.name ? String(entry.name) : key;
      const rawHex = entry && entry.hex ? String(entry.hex).trim() : '';
      const hex = HEX_RE.test(rawHex) ? rawHex : '#cccccc';
      return { name, hex, defined: !!(entry && entry.name) };
    }

    function listIcon(){
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>';
    }

    const PM = window.PriceListModel;
    if (!PM) throw new Error('PriceListModel no está cargado. Verifica que model.js se cargue antes de app.js.');

    function cloneModel(model){
      return PM.syncLegacyAliases(JSON.parse(JSON.stringify(model)));
    }

    const rawModels = Array.isArray(window.PRICELIST_MODELS) ? window.PRICELIST_MODELS : [];
    const normalized = PM.normalizeModels(rawModels);
    if (normalized.warnings.length) console.warn('[PriceList] Revisa estos datos:\n- ' + normalized.warnings.join('\n- '));

    // Copia base inmutable para comparar/restaurar; `data` es la copia de trabajo (con overrides).
    const models = normalized.models.map(cloneModel);
    const data = normalized.models.map(cloneModel);

    // ===== OVERRIDES (solo en este dispositivo) =====
    const OVERRIDES_KEY_V2 = 'pl_overrides_v2';
    const OVERRIDES_KEY_V1 = 'pl_overrides_v1';
    const overrides = {};

    function saveOverridesV2(){
      try { localStorage.setItem(OVERRIDES_KEY_V2, JSON.stringify(overrides)); } catch(e){}
    }

    function readJson(key){
      try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch(e){ return null; }
    }

    function migrateOverridesV1(rawV1){
      if (!rawV1 || typeof rawV1 !== 'object') return {};
      const out = {};
      Object.keys(rawV1).forEach((modelId) => {
        const entry = rawV1[modelId];
        const model = models.find((m) => m.id === modelId);
        if (!entry || typeof entry !== 'object' || !model) return;
        const clean = {};
        const base = Number(entry.printer_price);
        if (Number.isFinite(base) && base > 0) clean.base_price_usd = base;

        if ((entry.plans && typeof entry.plans === 'object') || (entry.plan_discounts && typeof entry.plan_discounts === 'object')){
          const variantMap = {};
          (model.variants || []).forEach((v) => {
            const byLabelPrice = entry.plans && Number(entry.plans[v.label]);
            const byLabelDiscount = entry.plan_discounts && Number(entry.plan_discounts[v.label]);
            const vEntry = {};
            if (Number.isFinite(byLabelPrice) && byLabelPrice > 0) vEntry.price_usd = byLabelPrice;
            if (Number.isFinite(byLabelDiscount) && byLabelDiscount >= 0 && byLabelDiscount <= 100) vEntry.ink_discount_pct = byLabelDiscount;
            if (Object.keys(vEntry).length) variantMap[v.id] = vEntry;
          });
          if (Object.keys(variantMap).length) clean.variants = variantMap;
        }

        if (entry.inks && typeof entry.inks === 'object'){
          const inkMap = {};
          (model.inks || []).forEach((ink) => {
            const byName = Number(entry.inks[ink.name]);
            if (Number.isFinite(byName) && byName > 0) inkMap[ink.id] = { price_usd: byName };
          });
          if (Object.keys(inkMap).length) clean.inks = inkMap;
        }

        if (Object.keys(clean).length) out[modelId] = clean;
      });
      return out;
    }

    function loadOverrides(){
      Object.keys(overrides).forEach((k) => delete overrides[k]);
      const rawV2 = readJson(OVERRIDES_KEY_V2);
      let source = rawV2;
      if (!source || typeof source !== 'object' || !Object.keys(source).length) {
        const rawV1 = readJson(OVERRIDES_KEY_V1);
        source = migrateOverridesV1(rawV1);
        if (Object.keys(source).length) {
          try { localStorage.setItem(OVERRIDES_KEY_V2, JSON.stringify(source)); } catch(e){}
        }
      }
      if (!source || typeof source !== 'object') return;
      Object.keys(source).forEach((modelId) => {
        const entry = source[modelId];
        const model = models.find((m) => m.id === modelId);
        if (!entry || typeof entry !== 'object' || !model) return;
        const clean = {};
        const base = Number(entry.base_price_usd != null ? entry.base_price_usd : entry.printer_price);
        if (Number.isFinite(base) && base > 0) clean.base_price_usd = base;

        if (entry.variants && typeof entry.variants === 'object') {
          const vMap = {};
          Object.keys(entry.variants).forEach((variantId) => {
            if (!(model.variants || []).some((v) => v.id === variantId)) return;
            const ve = entry.variants[variantId] || {};
            const vClean = {};
            const p = Number(ve.price_usd);
            const d = Number(ve.ink_discount_pct);
            if (Number.isFinite(p) && p > 0) vClean.price_usd = p;
            if (Number.isFinite(d) && d >= 0 && d <= 100) vClean.ink_discount_pct = d;
            if (Object.keys(vClean).length) vMap[variantId] = vClean;
          });
          if (Object.keys(vMap).length) clean.variants = vMap;
        }

        if (entry.inks && typeof entry.inks === 'object') {
          const iMap = {};
          Object.keys(entry.inks).forEach((inkId) => {
            if (!(model.inks || []).some((i) => i.id === inkId)) return;
            const ie = entry.inks[inkId] || {};
            const p = Number(ie.price_usd != null ? ie.price_usd : ie.price);
            if (Number.isFinite(p) && p > 0) iMap[inkId] = { price_usd: p };
          });
          if (Object.keys(iMap).length) clean.inks = iMap;
        }

        if (Object.keys(clean).length) overrides[modelId] = clean;
      });
    }

    function applyOverrideToModel(m){
      const o = overrides[m.id];
      if (!o) {
        PM.syncLegacyAliases(m);
        return;
      }
      if (Number.isFinite(o.base_price_usd) && o.base_price_usd > 0) m.base_price_usd = o.base_price_usd;
      if (o.variants && Array.isArray(m.variants)) {
        m.variants = m.variants.map((v) => {
          const ov = o.variants[v.id];
          if (!ov) return v;
          const next = { ...v };
          if (Number.isFinite(ov.price_usd) && ov.price_usd > 0) next.price_usd = ov.price_usd;
          if (Number.isFinite(ov.ink_discount_pct)) next.ink_discount_pct = Math.min(100, Math.max(0, ov.ink_discount_pct));
          return next;
        });
      }
      if (o.inks && Array.isArray(m.inks)) {
        m.inks = m.inks.map((ink) => {
          const oi = o.inks[ink.id];
          if (!oi || !Number.isFinite(oi.price_usd) || oi.price_usd <= 0) return ink;
          return { ...ink, price_usd: oi.price_usd };
        });
      }
      PM.syncLegacyAliases(m);
    }

    function applyOverrides(){ data.forEach(applyOverrideToModel); }

    function persistOverrides(){ saveOverridesV2(); }

    // Devuelve el modelo a sus valores originales y reaplica el override (si existe).
    function resetModelFromSource(id){
      const idx = data.findIndex((m) => m.id === id);
      const source = models.find((m) => m.id === id);
      if (idx < 0 || !source) return null;
      data[idx] = cloneModel(source);
      applyOverrideToModel(data[idx]);
      return data[idx];
    }

    loadOverrides();
    applyOverrides();

    // ===== SUSTRATOS (catálogo global para TCO, solo lectura) =====
    let substrates = [];

    function loadSubstrates(){
      const seed = Array.isArray(window.PRICELIST_SUBSTRATES) ? window.PRICELIST_SUBSTRATES : [];
      const normalized = PM.normalizeSubstrates(seed);
      if (normalized.warnings.length) console.warn('[Sustratos] Revisa estos datos:\n- ' + normalized.warnings.join('\n- '));
      substrates = normalized.substrates;
    }

    function getSubstrates(){ return substrates.slice(); }
    function getActiveSubstrates(){ return substrates.filter((s) => s && s.activo !== false); }

    loadSubstrates();


    function applyInkDiscount(inks, pct){
      const factor = 1 - (Number(pct) || 0) / 100;
      return (Array.isArray(inks) ? inks : []).map((ink) => {
        const base = Number(ink.price_usd != null ? ink.price_usd : ink.price) || 0;
        const price = base * factor;
        return {
          ...ink,
          price_usd: price,
          price,
          base_price_usd: base,
          price_per_ml: ink.capacity_ml ? price / ink.capacity_ml : null,
          price_old: factor === 1 ? null : base
        };
      });
    }

    function inkCards(inks){
      if (!inks.length) return '<div class="row"><span class="chip">Sin datos de tinta</span></div>';
      const trm = getTrm();
      return `<div class="ink-grid">
        ${inks.map((ink) => {
          const priceStr = formatAmount(ink.price);
          const priceOldStr = ink.price_old != null ? formatAmount(ink.price_old) : null;
          const equivUsdPerL = ink.capacity_ml ? (ink.price / ink.capacity_ml) * 1000 : null;
          const equivStr = equivUsdPerL != null && ink.capacity_ml && ink.capacity_ml !== 1000
            ? (currency === 'COP' && typeof trm === 'number' && trm > 0
                ? fmtCop.format(equivUsdPerL * trm)
                : fmtUsd.format(equivUsdPerL))
            : null;
          const costMl = Number(ink.price_per_ml);
          const costStr = Number.isFinite(costMl) && costMl > 0
            ? formatAmountPerMl(costMl).replace(' / ml', '')
            : null;
          return `
          <div class="ink-item">
            <p class="ink-name">${esc(ink.name)}</p>
            <p class="ink-meta">Precio: <strong>${priceStr}</strong>${priceOldStr ? ` <span class="ink-price-old">${priceOldStr}</span>` : ''}</p>
            ${ink.capacity_ml ? `<p class="ink-meta">Capacidad: ${ink.capacity_ml} ml</p>` : ''}
            ${equivStr ? `<p class="ink-meta">Equivalente: <strong>${equivStr}</strong> / L</p>` : ''}
            ${costStr ? `<p class="ink-meta">Costo (ml): <strong>${costStr}</strong></p>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    }

    function buildCover(){
      const cover = document.createElement('section');
      cover.className = 'cover';
      cover.innerHTML = `
        <h1 class="cover-title" tabindex="-1">LFP App</h1>
        <div class="cover-info">
          <ul class="cover-info-list">
            <li>Precios vigentes hasta el 31 Marzo 2027</li>
            <li>${esc(LEGAL_NOTE)}</li>
          </ul>
        </div>
        <div class="cover-search">
          <div class="search">
            <label class="sr-only" for="cover-q">Buscar modelo</label>
            <input id="cover-q" class="search-input" type="search" placeholder="Buscar modelo…" autocomplete="off" spellcheck="false" />
            <button type="button" class="search-clear" id="cover-search-clear" aria-label="Limpiar búsqueda" hidden>&times;</button>
          </div>
          <div class="category-filters" id="cover-category-filters" role="group" aria-label="Filtrar por categoría"></div>
          <p class="cover-search-meta" id="cover-search-count" aria-live="polite"></p>
          <div class="cover-models" id="cover-models"></div>
          <p class="search-empty" id="cover-search-empty" hidden></p>
        </div>`;
      return cover;
    }

    // Nota legal según la moneda activa (en COP se indica la TRM aplicada).
    function legalNote(){
      const trm = getTrm();
      if (currency === 'COP' && trm){
        return 'Los precios no incluyen IVA. Valores convertidos a COP con TRM de $'
          + trm.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\./g, '') + ' por Usd.';
      }
      return LEGAL_NOTE;
    }

    function buildCard(m, startPlanIndex){
      const variants = Array.isArray(m.variants) && m.variants.length ? m.variants : (Array.isArray(m.plans) ? m.plans : []);
      const hasVariants = variants.length > 0;
      const hasInkSkus = Array.isArray(m.ink_skus) && m.ink_skus.length > 0;
      const basePrice = PM.getEffectivePrice(m, PM.getDefaultVariant(m)) || Number(m.base_price_usd || m.printer_price) || 0;
      const variantChangesPrice = hasVariants && variants.some((v) => PM.getEffectivePrice(m, v) !== basePrice);
      const segLabel = variantChangesPrice ? 'Plan / cobertura' : 'Descuento en tinta';

      const card = document.createElement('article');
      card.className = 'card';

      card.innerHTML = `
        <div class="card-head">
          <div class="card-head-row">
            <h1 class="title1" tabindex="-1">${esc(m.name)}</h1>
            <div class="card-head-actions">
              ${m.tco_enabled ? `<a href="#tco/${esc(m.id)}" class="card-edit" data-role="tco-link" aria-label="Simular Costos de ${esc(m.name)}" title="Simular Costos">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <rect x="4" y="3" width="16" height="18" rx="2"/>
                  <path d="M8 7h8"/>
                  <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01"/>
                </svg>
              </a>` : ''}
              <button type="button" class="card-edit" data-edit-prices aria-haspopup="dialog" aria-controls="edit-modal"
                aria-label="Editar precios de ${esc(m.name)}" title="Editar Precios">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                  <path d="M12 2v20"/>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
              </button>
            </div>
          </div>
          <p class="subtitle1">${esc(legalNote())}</p>
        </div>
        <div class="prices">
          <div class="price-box">
            <p class="price-label" style="font-weight:700;color:var(--ink)">Hardware (PVP)</p>
            <p class="price-value" data-role="price"></p>
            <div class="row" data-role="price-meta"></div>
          </div>
          ${hasVariants && variants.length > 1 ? `
          <div class="price-box">
            <p class="price-label" id="plans-${esc(m.id)}" style="font-weight:700;color:var(--ink)">${esc(segLabel)}</p>
            <div class="seg" data-role="seg" role="radiogroup" aria-labelledby="plans-${esc(m.id)}">
              ${variants.map((v, i) => `<button type="button" class="seg-btn" role="radio" aria-checked="false" tabindex="-1" data-i="${i}" data-variant-id="${esc(v.id)}">${esc(v.label)}</button>`).join('')}
            </div>
          </div>` : ''}
          <div class="price-box full">
            <div class="price-box-head">
              <p class="price-label" style="font-weight:700;color:var(--ink)">Tintas (PVP)</p>
              ${hasInkSkus ? `<button type="button" class="filter-chip list-btn" data-role="ink-list" aria-haspopup="dialog" aria-controls="ink-list-modal" aria-label="Ver lista de tintas y SKU de ${esc(m.name)}" title="Ver lista de tintas">${listIcon()}Lista</button>` : ''}
            </div>
            <div data-role="inks"></div>
          </div>
          ${Array.isArray(m.accessories) && m.accessories.length ? `
          <div class="price-box full">
            <p class="price-label" style="font-weight:700;color:var(--ink)">Accesorios</p>
            <div class="ink-grid">
              ${m.accessories.map((a) => `
                <div class="ink-item">
                  <p class="ink-name">${esc(a.label)}</p>
                  <p class="ink-meta">Precio: <strong>${formatAmount(a.price_usd)}</strong></p>
                  ${a.sku ? `<p class="ink-meta">SKU: ${esc(a.sku)}</p>` : ''}
                </div>`).join('')}
            </div>
          </div>` : ''}
        </div>
        <p class="sr-only" role="status" data-role="status"></p>`;

      const notes = document.createElement('section');
      notes.className = 'notes-section';
      notes.innerHTML = `
        <article class="notes-card">
          <header class="notes-card-head">
            <p class="notes-card-title" style="font-weight:700">Notas</p>
          </header>
          <div class="notes-card-body">
            <p class="notes-content" data-role="notes"></p>
          </div>
        </article>`;

      const elPrice = card.querySelector('[data-role="price"]');
      const elMeta = card.querySelector('[data-role="price-meta"]');
      const elInks = card.querySelector('[data-role="inks"]');
      const elNotes = notes.querySelector('[data-role="notes"]');
      const elStatus = card.querySelector('[data-role="status"]');
      const tcoLink = card.querySelector('[data-role="tco-link"]');

      const editBtn = card.querySelector('[data-edit-prices]');
      if (editBtn) editBtn.addEventListener('click', () => openEditModal(m.id));

      const inkListBtn = card.querySelector('[data-role="ink-list"]');
      if (inkListBtn) inkListBtn.addEventListener('click', () => openInkListModal(m.id, inkListBtn));

      function update(variant){
        const v = variant || PM.getDefaultVariant(m);
        const discount = PM.getEffectiveInkDiscount(m, v);
        const modelBase = Number(m.base_price_usd != null ? m.base_price_usd : m.printer_price) || 0;
        const price = PM.getEffectivePrice(m, v);
        const inks = applyInkDiscount(m.inks, discount);

        elPrice.textContent = formatAmount(price);
        if (tcoLink) tcoLink.href = '#tco/' + encodeURIComponent(m.id) + '/' + encodeURIComponent(v.id);

        const chips = [];
        if (v && (variants.length > 1 || v.label !== 'Base')) chips.push(`<span class="chip">${esc(v.label)}</span>`);
        if (v && price !== modelBase && variants.length > 1) chips.push(`<span class="chip">PVP base: <strong>${formatAmount(modelBase)}</strong></span>`);
        if (!hasVariants && m.fair_price > 0) chips.push(`<span class="chip">Precio de feria: <strong>${formatAmount(m.fair_price)}</strong></span>`);
        elMeta.innerHTML = chips.join('');

        elInks.innerHTML = (discount > 0 ? `<div class="row"><span class="chip">Dto. en tinta: ${discount}%</span></div>` : '') + inkCards(inks);
        elNotes.textContent = (v && v.notes != null && String(v.notes).trim() ? v.notes : m.notes) || '—';

        const statusPrice = formatAmount(price);
        elStatus.textContent = [m.name, variants.length > 1 ? v.label : '', statusPrice,
          discount > 0 ? 'descuento en tinta del ' + discount + '%' : ''].filter(Boolean).join('. ');
      }

      if (hasVariants && variants.length > 1){
        const seg = card.querySelector('[data-role="seg"]');
        const buttons = Array.from(seg.querySelectorAll('.seg-btn'));
        const last = buttons.length - 1;

        const select = (index, focus) => {
          const safeIndex = Math.min(Math.max(index, 0), variants.length - 1);
          activePlanIndex = safeIndex;
          activeVariantId = variants[safeIndex].id;
          buttons.forEach((btn, i) => {
            btn.setAttribute('aria-checked', i === safeIndex ? 'true' : 'false');
            btn.tabIndex = i === safeIndex ? 0 : -1;
          });
          update(variants[safeIndex]);
          if (focus) buttons[safeIndex].focus();
        };

        seg.addEventListener('click', (e) => {
          const btn = e.target.closest('.seg-btn');
          if (!btn) return;
          select(Number(btn.dataset.i), false);
        });

        seg.addEventListener('keydown', (e) => {
          const current = buttons.indexOf(document.activeElement);
          if (current < 0) return;
          let next = null;
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = current === last ? 0 : current + 1;
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = current === 0 ? last : current - 1;
          else if (e.key === 'Home') next = 0;
          else if (e.key === 'End') next = last;
          if (next == null) return;
          e.preventDefault();
          select(next, true);
        });

        let start = 0;
        if (typeof startPlanIndex === 'string') {
          const idx = variants.findIndex((v) => v.id === startPlanIndex);
          start = idx >= 0 ? idx : 0;
        } else if (Number.isInteger(startPlanIndex)) {
          start = Math.min(Math.max(startPlanIndex, 0), variants.length - 1);
        } else {
          const defIdx = variants.findIndex((v) => v.is_default);
          start = defIdx >= 0 ? defIdx : 0;
        }
        select(start, false);
      } else {
        const only = variants[0] || PM.getDefaultVariant(m);
        activePlanIndex = 0;
        activeVariantId = only.id;
        update(only);
      }

      const wrap = document.createElement('div');
      wrap.className = 'product-view';
      wrap.append(card, notes);
      return wrap;
    }

    function markActive(id){
      for (const link of picker.querySelectorAll('.model-btn')){
        if (id && link.dataset.id === id) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
      if (!id) return;

      const active = picker.querySelector('.model-btn[aria-current="page"]');
      if (!active || !active.getClientRects().length) return;
      const box = picker.getBoundingClientRect();
      const item = active.getBoundingClientRect();
      if (item.top < box.top) picker.scrollTop -= box.top - item.top;
      else if (item.bottom > box.bottom) picker.scrollTop += item.bottom - box.bottom;
      if (item.left < box.left) picker.scrollLeft -= box.left - item.left;
      else if (item.right > box.right) picker.scrollLeft += item.right - box.right;
    }

    function renderProduct(id, opts){
      destroyTco();
      const model = data.find((m) => m.id === id) || data[0];
      if (!model){
        stage.innerHTML = '<p class="noscript">No hay productos cargados.</p>';
        return;
      }

      const variantId = opts && opts.variantId ? String(opts.variantId) : null;
      const planIndex = opts && Number.isInteger(opts.planIndex) ? opts.planIndex : null;
      stage.replaceChildren(buildCard(model, variantId != null ? variantId : planIndex));
      stage.scrollTop = 0;
      markActive(model.id);
      document.title = model.name + ' · LFP App';

      if (opts && opts.focus){
        const heading = stage.querySelector('.title1');
        if (heading) heading.focus({ preventScroll: true });
      }

      const desiredHash = model.id;
      if (location.hash.slice(1) !== desiredHash) history.replaceState(null, '', '#' + desiredHash);
    }

    function destroyTco(){
      if (tcoInstance){
        try { tcoInstance.destroy(); } catch(e){}
        tcoInstance = null;
      }
    }

    let tcoLoadPromise = null;
    function loadScript(src){
      return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-tco-src="' + src + '"]');
        if (existing){
          if (existing.dataset.loaded === 'true') return resolve();
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('No se pudo cargar: ' + src)), { once: true });
          return;
        }
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.dataset.tcoSrc = src;
        s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
        s.onerror = () => reject(new Error('No se pudo cargar: ' + src));
        document.head.appendChild(s);
      });
    }
    function ensureTcoLoaded(){
      if (window.SIMULADOR_TCO_CONFIG && window.ChannelToolsTCO) return Promise.resolve();
      if (tcoLoadPromise) return tcoLoadPromise;
      tcoLoadPromise = (async () => {
        if (!document.querySelector('link[data-tco-css="1"]')){
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'simulador-tco/css/simulador-tco.css';
          link.dataset.tcoCss = '1';
          document.head.appendChild(link);
        }
        const scripts = [
          'vendor/chart.umd.min.js',
          'simulador-tco/js/core/FormatoEs.js',
          'simulador-tco/js/core/TintaService.js',
          'simulador-tco/js/core/TCOCalculator.js',
          'simulador-tco/js/core/PaybackService.js',
          'simulador-tco/js/state/SimuladorStore.js',
          'simulador-tco/js/ui/ChartManager.js',
          'simulador-tco/js/ui/SimuladorUI.js',
          'simulador-tco/js/index.js',
          'simulador-tco/catalogo-pricelist.js'
        ];
        for (const src of scripts){ await loadScript(src); }
        if (!window.SIMULADOR_TCO_CONFIG || !window.ChannelToolsTCO) {
          throw new Error('Módulo de simulación no disponible.');
        }
      })().catch((e) => {
        tcoLoadPromise = null;
        throw e;
      });
      return tcoLoadPromise;
    }

    function renderTcoView(modelId, opts){
      destroyTco();
      const model = data.find((m) => m.id === modelId);
      if (!model || !model.tco_enabled){
        if (model) renderProduct(model.id, opts);
        else renderHome(opts);
        return;
      }

      const requestedVariantId = opts && opts.variantId ? String(opts.variantId) : (activeVariantId || null);
      const selectedVariant = PM.getVariantById(model, requestedVariantId) || PM.getDefaultVariant(model);
      const selectedVariantId = selectedVariant ? selectedVariant.id : null;

      stage.innerHTML = '';
      stage.scrollTop = 0;
      markActive(model.id);
      document.title = 'Simulador de Costos · ' + model.name;

      const wrap = document.createElement('section');
      wrap.className = 'product-view';

      const header = document.createElement('article');
      header.className = 'card';
      const trm = getTrm();
      const tcoSubtitle = (currency === 'COP' && trm)
        ? `${esc(model.name)} · Valores mostrados en Cop (TRM: ${Number(manualTrm).toLocaleString('es-CO',{minimumFractionDigits:2, maximumFractionDigits:2}).replace(/\./g, '')} Cop/Usd). Cálculos base en Usd.`
        : `${esc(model.name)} · Cálculo y valores en Usd.`;
      header.innerHTML = `
        <div class="card-head">
          <div class="card-head-row">
            <h1 class="title1" tabindex="-1">Simular Costos</h1>
            <a href="#${esc(model.id)}" class="card-edit" aria-label="Volver a ${esc(model.name)}" title="Volver">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="10"/>
                <path d="m12 8-4 4 4 4"/>
                <path d="M16 12H8"/>
              </svg>
            </a>
          </div>
          <p class="subtitle1" data-role="tco-subtitle">${tcoSubtitle}</p>
        </div>
        <div class="prices tco-prices">
          <div class="price-box full tco-mount-box">
            <p class="sr-only" role="status" data-role="tco-status"></p>
            <div id="tco-mount"><p class="search-empty tco-loading">Cargando simulador…</p></div>
          </div>
        </div>`;

      wrap.appendChild(header);
      stage.appendChild(wrap);

      if (opts && opts.focus){
        const heading = stage.querySelector('.title1');
        if (heading) heading.focus({ preventScroll: true });
      }

      const mountEl = document.getElementById('tco-mount');
      const requestToken = 'tco/' + model.id + (selectedVariantId ? '/' + selectedVariantId : '');
      ensureTcoLoaded().then(() => {
        if (location.hash.slice(1) !== requestToken || !mountEl || !mountEl.isConnected) return;
        try {
          const tcoModels = [model];
          const catalogo = window.SIMULADOR_TCO_CONFIG.buildTcoCatalog(tcoModels, { globales: {}, sustratos: getActiveSubstrates() });
          tcoInstance = window.ChannelToolsTCO.mount(mountEl, {
            catalogo,
            equipoInicialId: model.id,
            varianteInicialId: selectedVariantId,
            display: { currency, trm: getTrm() },
            onError: (err) => { console.warn('[TCO]', err); }
          });
        } catch (e) {
          mountEl.innerHTML = '<div class="noscript">No se pudo cargar el simulador: ' + esc(e && e.message ? e.message : String(e)) + '</div>';
          console.error(e);
        }
      }).catch((e) => {
        if (!mountEl || !mountEl.isConnected) return;
        mountEl.innerHTML = '<div class="noscript">No se pudo cargar el simulador: ' + esc(e && e.message ? e.message : String(e)) + '</div>';
        console.error(e);
      });

      if (location.hash.slice(1) !== requestToken) history.replaceState(null, '', '#' + requestToken);
    }

    function renderHome(opts){
      destroyTco();
      stage.replaceChildren(buildCover());
      stage.scrollTop = 0;
      markActive(null);
      document.title = 'LFP App';

      if (opts && opts.focus){
        const heading = stage.querySelector('.cover-title');
        if (heading) heading.focus({ preventScroll: true });
      }

      if (location.hash.slice(1) !== HOME_ID) history.replaceState(null, '', '#' + HOME_ID);

      const coverQ = document.getElementById('cover-q');
      const coverClear = document.getElementById('cover-search-clear');
      const coverCount = document.getElementById('cover-search-count');
      const coverEmpty = document.getElementById('cover-search-empty');
      const coverCatFilters = document.getElementById('cover-category-filters');
      const coverModels = document.getElementById('cover-models');

      let coverCategory = selectedCategory || 'all';

      if (coverModels){
        data.forEach((m) => {
          const a = document.createElement('a');
          a.className = 'model-btn';
          a.href = '#' + m.id;
          a.dataset.id = m.id;
          a.dataset.search = normalize(m.name);
          a.dataset.category = String(m.category || '').trim();
          a.innerHTML = `<span>${esc(m.name)}</span>` +
            (m.fair_price > 0 ? '<span class="chip">Oferta</span>' : '');
          a.addEventListener('click', () => closeMenu({ restoreFocus: false }));
          coverModels.appendChild(a);
        });
      }

      if (coverCatFilters){
        const categories = [];
        const seen = new Set();
        data.forEach((m) => {
          const cat = String(m.category || '').trim();
          if (cat && !seen.has(cat)){ seen.add(cat); categories.push(cat); }
        });
        if (categories.length){
          const allBtn = document.createElement('button');
          allBtn.type = 'button';
          allBtn.className = 'filter-chip';
          allBtn.dataset.category = 'all';
          allBtn.textContent = 'Todos';
          allBtn.setAttribute('aria-pressed', coverCategory === 'all' ? 'true' : 'false');
          coverCatFilters.appendChild(allBtn);

          categories.forEach((cat) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'filter-chip';
            btn.dataset.category = cat;
            btn.textContent = cat;
            btn.setAttribute('aria-pressed', coverCategory === cat ? 'true' : 'false');
            coverCatFilters.appendChild(btn);
          });

          coverCatFilters.onclick = (e) => {
            const btn = e.target.closest('.filter-chip');
            if (!btn) return;
            coverCategory = btn.dataset.category || 'all';
            coverCatFilters.querySelectorAll('.filter-chip').forEach((b) => {
              b.setAttribute('aria-pressed', b.dataset.category === coverCategory ? 'true' : 'false');
            });
            updateCover();
          };
        } else {
          coverCatFilters.hidden = true;
        }
      }

      const updateCover = () => {
        const qRaw = coverQ ? (coverQ.value || '') : '';
        const q = normalize(qRaw);
        const links = coverModels ? Array.from(coverModels.querySelectorAll('.model-btn')) : [];
        let shown = 0;
        let firstMatch = null;

        for (const link of links){
          const matchSearch = !q || (link.dataset.search || '').includes(q);
          const matchCategory = coverCategory === 'all' || (link.dataset.category || '') === coverCategory;
          const match = matchSearch && matchCategory;
          link.hidden = !match;
          if (match){
            shown++;
            if (!firstMatch) firstMatch = link;
          }
        }

        if (coverClear) coverClear.hidden = !q;
        if (coverEmpty){
          coverEmpty.hidden = shown !== 0;
          if (!shown) coverEmpty.textContent = 'Sin resultados para «' + qRaw.trim() + '».';
        }
        if (coverCount){
          if (!q && coverCategory === 'all'){
            coverCount.textContent = data.length + ' modelos disponibles';
          } else {
            coverCount.textContent = shown + ' de ' + data.length + ' modelos' + (firstMatch ? ' · Enter para abrir el primero' : '');
          }
        }
        return firstMatch ? data.find((m) => m.id === firstMatch.dataset.id) : null;
      };

      if (coverQ){
        coverQ.addEventListener('input', updateCover);
        coverQ.addEventListener('keydown', (e) => {
          if (e.key === 'Enter'){
            e.preventDefault();
            const match = updateCover();
            if (!match) return;
            closeMenu({ restoreFocus: false });
            location.hash = match.id;
          }
          if (e.key === 'Escape' && coverQ.value){
            e.preventDefault();
            coverQ.value = '';
            updateCover();
          }
        });
        if (coverClear){
          coverClear.addEventListener('click', () => {
            coverQ.value = '';
            updateCover();
            coverQ.focus({ preventScroll: true });
          });
        }
      }
      updateCover();
    }

    function parseHash(){
      const raw = location.hash.slice(1);
      const parts = raw.split('/').filter(Boolean);
      if (parts[0] === 'tco') {
        return { view: 'tco', id: parts[1] || '', variantId: parts[2] || null };
      }
      return { view: 'product', id: parts[0] || '', variantId: parts[1] || null };
    }

    function route(opts){
      const h = parseHash();
      if (h.view === 'tco' && data.some((m) => m.id === h.id)) {
        const target = data.find((m) => m.id === h.id);
        if (target && target.tco_enabled) {
          renderTcoView(h.id, { ...(opts || {}), variantId: h.variantId });
          return;
        }
        // Modelo sin TCO habilitado: se muestra su ficha normal.
        if (window.history && typeof history.replaceState === 'function') {
          history.replaceState(null, '', '#' + h.id);
        }
        renderProduct(h.id, { ...(opts || {}), variantId: h.variantId });
        return;
      }
      if (data.some((m) => m.id === h.id)) {
        renderProduct(h.id, { ...(opts || {}), variantId: h.variantId });
        return;
      }
      renderHome(opts);
    }

    const currentId = () => {
      const h = parseHash();
      return data.some((m) => m.id === h.id) ? h.id : null;
    };

    // CAJÓN MÓVIL + BUSCADOR
    const menuBtn = document.getElementById('menu-btn');
    const menuClose = document.getElementById('menu-close');
    const scrim = document.getElementById('scrim');
    const searchInput = document.getElementById('q');
    const searchClear = document.getElementById('search-clear');
    const searchCount = document.getElementById('search-count');
    const searchEmpty = document.getElementById('search-empty');
    const categoryFiltersEl = document.getElementById('category-filters');

    const isMobile = () => window.matchMedia('(max-width:900px)').matches;
    let menuOpen = false;
    let lastFocus = null;

    function syncInert(){
      const mobile = isMobile();
      pickerEl.inert = mobile && !menuOpen;
      if (mobile){
        pickerEl.setAttribute('role', 'dialog');
        if (!menuOpen) pickerEl.removeAttribute('aria-modal');
      } else {
        pickerEl.removeAttribute('role');
        pickerEl.removeAttribute('aria-modal');
      }
    }

    function focusables(){
      return Array.from(pickerEl.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])'))
        .filter((el) => el.getClientRects().length > 0);
    }

    function openMenu(){
      if (menuOpen || !isMobile()) return;
      menuOpen = true;
      lastFocus = document.activeElement;
      pickerEl.dataset.open = 'true';
      scrim.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      pickerEl.setAttribute('aria-modal', 'true');
      syncInert();
      markActive(currentId());
      if (searchInput){
        searchInput.focus({ preventScroll: true });
        searchInput.select();
      }
    }

    function closeMenu(opts){
      if (!menuOpen) return;
      menuOpen = false;
      pickerEl.removeAttribute('data-open');
      scrim.hidden = true;
      menuBtn.setAttribute('aria-expanded', 'false');
      syncInert();
      if (!opts || opts.restoreFocus !== false){
        const target = (lastFocus && lastFocus.isConnected && lastFocus !== document.body && !pickerEl.contains(lastFocus))
          ? lastFocus : menuBtn;
        target.focus({ preventScroll: true });
      }
    }

    function renderCategoryFilters(){
      if (!categoryFiltersEl) return;
      const categories = [];
      const seen = new Set();
      data.forEach((m) => {
        const cat = String(m.category || '').trim();
        if (cat && !seen.has(cat)){ seen.add(cat); categories.push(cat); }
      });
      categoryFiltersEl.innerHTML = '';
      if (!categories.length){ categoryFiltersEl.hidden = true; return; }
      categoryFiltersEl.hidden = false;
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'filter-chip';
      allBtn.dataset.category = 'all';
      allBtn.textContent = 'Todos';
      allBtn.setAttribute('aria-pressed', selectedCategory === 'all' ? 'true' : 'false');
      categoryFiltersEl.appendChild(allBtn);
      categories.forEach((cat) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-chip';
        btn.dataset.category = cat;
        btn.textContent = cat;
        btn.setAttribute('aria-pressed', selectedCategory === cat ? 'true' : 'false');
        categoryFiltersEl.appendChild(btn);
      });
      categoryFiltersEl.onclick = (e) => {
        const btn = e.target.closest('.filter-chip');
        if (!btn) return;
        selectedCategory = btn.dataset.category || 'all';
        categoryFiltersEl.querySelectorAll('.filter-chip').forEach((b) => {
          b.setAttribute('aria-pressed', b.dataset.category === selectedCategory ? 'true' : 'false');
        });
        filterModels();
      };
    }

    function filterModels(){
      if (!searchInput) return;
      const q = normalize(searchInput.value);
      const links = Array.from(picker.querySelectorAll('.model-btn'));
      let shown = 0;

      for (const link of links){
        const matchSearch = !q || (link.dataset.search || '').includes(q);
        const matchCategory = selectedCategory === 'all' || (link.dataset.category || '') === selectedCategory;
        const match = matchSearch && matchCategory;
        link.hidden = !match;
        if (match) shown++;
      }

      picker.scrollTop = 0;
      if (searchClear) searchClear.hidden = !q;
      if (searchEmpty){
        searchEmpty.hidden = shown !== 0;
        if (!shown) searchEmpty.textContent = 'Sin resultados para «' + searchInput.value.trim() + '».';
      }
      if (searchCount){
        searchCount.textContent = shown === data.length
          ? data.length + ' modelos'
          : shown + ' de ' + data.length + ' modelos';
      }
    }

    if (menuBtn && menuClose && scrim){
      menuBtn.addEventListener('click', openMenu);
      menuClose.addEventListener('click', () => closeMenu());
      scrim.addEventListener('click', () => closeMenu());

      pickerEl.addEventListener('click', (e) => {
        if (menuOpen && e.target.closest('a')) closeMenu({ restoreFocus: false });
      });

      document.addEventListener('keydown', (e) => {
        if (!menuOpen) return;
        if (e.key === 'Escape'){
          e.preventDefault();
          closeMenu();
          return;
        }
        if (e.key !== 'Tab') return;
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first){
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last){
          e.preventDefault();
          first.focus();
        }
      });

      window.addEventListener('resize', () => {
        syncInert();
        if (menuOpen && !isMobile()) closeMenu({ restoreFocus: false });
      });
    }

    if (searchInput){
      searchInput.addEventListener('input', filterModels);
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && searchInput.value){
          e.stopPropagation();
          searchInput.value = '';
          filterModels();
        }
      });
    }
    if (searchClear && searchInput){
      searchClear.addEventListener('click', () => {
        searchInput.value = '';
        filterModels();
        searchInput.focus({ preventScroll: true });
      });
    }

    // MONEDA Y MODAL TRM
    const currencyToggleBtn = document.getElementById('currency-toggle');
    const trmOpenBtn = document.getElementById('trm-open-btn');
    const trmModalEl = document.getElementById('trm-modal');
    const trmScrimEl = document.getElementById('trm-scrim');
    const trmCloseEl = document.getElementById('trm-close');
    const trmCancelEl = document.getElementById('trm-cancel');
    const trmSaveEl = document.getElementById('trm-save');
    const trmInputEl = document.getElementById('trm-input');
    const trmErrorEl = document.getElementById('trm-error');
    const appShell = document.querySelector('.app');

    // 'toggle' = el usuario quiere pasar a COP · 'edit' = solo actualizar la tasa
    let trmIntent = 'toggle';
    let trmReturnFocus = null;

    function syncCurrencyUI(){
      const isCop = currency === 'COP';
      if (currencyToggleBtn){
        currencyToggleBtn.setAttribute('aria-checked', isCop ? 'true' : 'false');
        currencyToggleBtn.setAttribute('aria-label', 'Moneda (USD / COP)');
      }
      document.querySelectorAll('.currency-label[data-currency]').forEach((btn) => {
        btn.setAttribute('aria-pressed', btn.dataset.currency === currency ? 'true' : 'false');
      });
    }

    // Si el navegador desplazó el documento (foco, teclado), se devuelve a su sitio.
    function resetPageScroll(){
      const se = document.scrollingElement || document.documentElement;
      if (se && se.scrollTop) se.scrollTop = 0;
      if (document.body && document.body.scrollTop) document.body.scrollTop = 0;
      if (window.scrollY) window.scrollTo(0, 0);
    }

    function openTrmModal(intent){
      if (!trmModalEl) return;
      // Si venimos del cajón móvil se cierra: si no, queda tapando el producto detrás del modal.
      const fromDrawer = menuOpen;
      if (fromDrawer) closeMenu({ restoreFocus: false });
      resetPageScroll();
      trmIntent = intent === 'edit' ? 'edit' : 'toggle';
      // Con el cajón cerrado, el engranaje queda oculto e inerte: el foco vuelve al botón de menú.
      trmReturnFocus = fromDrawer ? menuBtn
        : (intent === 'edit' && trmOpenBtn ? trmOpenBtn : document.activeElement);
      trmModalEl.hidden = false;
      if (trmErrorEl) trmErrorEl.hidden = true;
      if (trmInputEl) trmInputEl.removeAttribute('aria-invalid');
      if (appShell) appShell.inert = true;
      setTimeout(() => {
        if (trmInputEl){
          trmInputEl.value = (typeof manualTrm === 'number' && manualTrm > 0) ? String(manualTrm) : '';
          // preventScroll: el foco no debe panear el documento (franja vacía al fondo).
          try { trmInputEl.focus({ preventScroll: true }); trmInputEl.select(); } catch(ex){}
        }
      }, 10);
    }

    function closeTrmModal(){
      if (!trmModalEl) return;
      trmModalEl.hidden = true;
      if (appShell) appShell.inert = false;
      // Solo se devuelve el foco a un destino visible y fuera de zonas inertes.
      const back = trmReturnFocus;
      const usable = back && back !== document.body && back.isConnected
        && back.getClientRects().length > 0 && !back.closest('[inert]');
      const fallback = (menuBtn && menuBtn.getClientRects().length > 0) ? menuBtn : currencyToggleBtn;
      try { (usable ? back : fallback).focus({ preventScroll: true }); } catch(ex){}
      trmReturnFocus = null;
      resetPageScroll();
    }

    // Cancelar no cambia la moneda: si venía del toggle, todo sigue como estaba.
    function cancelTrmModal(){
      closeTrmModal();
      trmIntent = 'toggle';
      syncCurrencyUI();
    }

    // Acepta "4000", "4000,50", "4000.50" y "4.000,50".
    function parseAmount(raw){
      let s = String(raw == null ? '' : raw).trim().replace(/\s/g, '');
      if (!s) return NaN;
      if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
      else if (s.includes(',')) s = s.replace(',', '.');
      const n = Number(s);
      return Number.isFinite(n) ? n : NaN;
    }
    const parseTrm = parseAmount;

    function rerenderCurrentView(){
      // Conserva plan seleccionado y posición de scroll al reconvertir la moneda/vista.
      const scroll = stage.scrollTop;
      const planIndex = activePlanIndex;
      const hash = location.hash.slice(1);
      if (hash.indexOf('tco/') === 0){
        const parts = hash.split('/');
        const id = parts[1];
        const variantId = parts[2] || null;
        if (id && data.some((m) => m.id === id)) {
          if (tcoInstance && typeof tcoInstance.setDisplay === 'function') {
            tcoInstance.setDisplay({ currency, trm: getTrm() });
            const sub = stage.querySelector('[data-role="tco-subtitle"]');
            const model = data.find((m) => m.id === id);
            if (sub && model) {
              const trm = getTrm();
              sub.textContent = (currency === 'COP' && trm)
                ? `${model.name} · Valores mostrados en Cop (TRM: ${Number(manualTrm).toLocaleString('es-CO',{minimumFractionDigits:2, maximumFractionDigits:2}).replace(/\./g, '')} Cop/Usd). Cálculos base en Usd.`
                : `${model.name} · Cálculo y valores en Usd.`;
            }
          } else {
            renderTcoView(id, { variantId });
          }
          stage.scrollTop = scroll;
          return;
        }
      }
      if (data.some((m) => m.id === hash)) renderProduct(hash, { planIndex });
      else renderHome();
      stage.scrollTop = scroll;
    }

    function setCurrency(next){
      const target = next === 'COP' ? 'COP' : 'USD';
      if (target === 'COP'){
        if (typeof manualTrm !== 'number' || manualTrm <= 0){
          openTrmModal('toggle');
          syncCurrencyUI();
          return;
        }
        currency = 'COP';
        try { localStorage.setItem('pl_currency', 'COP'); } catch(e){}
        syncCurrencyUI();
        rerenderCurrentView();
        return;
      }
      currency = 'USD';
      try { localStorage.setItem('pl_currency', 'USD'); } catch(e){}
      syncCurrencyUI();
      rerenderCurrentView();
    }

    if (trmOpenBtn) trmOpenBtn.addEventListener('click', () => openTrmModal('edit'));
    if (trmScrimEl) trmScrimEl.addEventListener('click', cancelTrmModal);
    if (trmCloseEl) trmCloseEl.addEventListener('click', cancelTrmModal);
    if (trmCancelEl) trmCancelEl.addEventListener('click', cancelTrmModal);

    if (trmSaveEl && trmInputEl){
      trmSaveEl.addEventListener('click', () => {
        const v = parseTrm(trmInputEl.value);
        if (!Number.isFinite(v) || v <= 0 || v > 1000000){
          if (trmErrorEl){
            trmErrorEl.textContent = 'Ingresa una TRM válida en pesos por 1 Usd (ejemplo: 4000,00).';
            trmErrorEl.hidden = false;
          }
          trmInputEl.setAttribute('aria-invalid', 'true');
          trmInputEl.focus();
          trmInputEl.select();
          return;
        }
        manualTrm = v;
        try { localStorage.setItem('pl_trm', String(v)); } catch(e){}
        // Solo el toggle cambia de moneda; desde el engranaje se respeta la vista actual.
        if (trmIntent === 'toggle'){
          currency = 'COP';
          try { localStorage.setItem('pl_currency', 'COP'); } catch(e){}
        }
        trmIntent = 'toggle';
        closeTrmModal();
        syncCurrencyUI();
        rerenderCurrentView();
      });

      trmInputEl.addEventListener('input', () => {
        if (trmErrorEl) trmErrorEl.hidden = true;
        trmInputEl.removeAttribute('aria-invalid');
      });

      trmInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); trmSaveEl.click(); }
        if (e.key === 'Escape'){ e.preventDefault(); if (trmCancelEl) trmCancelEl.click(); }
      });
    }

    // El foco no escapa del modal mientras está abierto.
    function installFocusTrap(modal){
      if (!modal) return;
      modal.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        if (modal.id === 'edit-modal' && variantPricingModalEl && !variantPricingModalEl.hidden) return;
        const items = Array.from(modal.querySelectorAll('button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
          .filter((el) => el.getClientRects().length > 0 && !el.closest('.modal[hidden]'));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
      });
    }
    installFocusTrap(trmModalEl);

    // ===== MODAL LISTA DE TINTAS / SKU =====
    const inkListModalEl = document.getElementById('ink-list-modal');
    const inkListScrimEl = document.getElementById('ink-list-scrim');
    const inkListCloseEl = document.getElementById('ink-list-close');
    const inkListDoneEl = document.getElementById('ink-list-done');
    const inkListTitleEl = document.getElementById('ink-list-title');
    const inkListContentEl = document.getElementById('ink-list-content');
    const inkSkuTagsEl = document.getElementById('ink-sku-tags');

    let inkListModelId = null;
    let inkListReturnFocus = null;
    let inkListTag = null;

    function inkSkuGroups(m){
      return Array.isArray(m && m.ink_skus) ? m.ink_skus : [];
    }

    function renderInkList(){
      const m = data.find((x) => x.id === inkListModelId);
      if (!m || !inkListContentEl) return;
      const groups = inkSkuGroups(m);
      const tags = [];
      groups.forEach((g) => {
        const t = String(g && g.tag ? g.tag : '').trim();
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
      // Sin "Todos": siempre hay un tag seleccionado; por defecto el primero definido en data.js.
      if (tags.indexOf(inkListTag) === -1) inkListTag = tags[0] || '';

      if (inkSkuTagsEl){
        if (tags.length > 0){
          inkSkuTagsEl.hidden = false;
          inkSkuTagsEl.innerHTML = tags.map((t) =>
            `<button type="button" class="filter-chip" data-tag="${esc(t)}" aria-pressed="${inkListTag === t ? 'true' : 'false'}">${esc(t)}</button>`
          ).join('');
        } else {
          inkSkuTagsEl.hidden = true;
          inkSkuTagsEl.innerHTML = '';
        }
      }

      const visible = groups.filter((g) => String(g.tag || '').trim() === inkListTag);
      if (!visible.length){
        inkListContentEl.innerHTML = '<p class="edit-note">Sin tintas para esta capacidad.</p>';
        return;
      }
      inkListContentEl.innerHTML = visible.map((g) => {
        const rows = (g.inks || []).map((ink) => {
          const info = getColorInfo(ink.color);
          const dotTitle = info.defined ? info.name : (String(ink.color || '').trim() + ' (color no definido)');
          return `<tr>
            <td><span class="color-dot" style="background:${info.hex}" title="${esc(dotTitle)}" aria-hidden="true"></span></td>
            <td>${esc(info.name)}</td>
            <td>${esc(ink.sku)}</td>
          </tr>`;
        }).join('');
        return `<section class="ink-sku-group-wrap">
          <p class="ink-sku-group">${esc(g.tag || g.id || '')}</p>
          <div class="pricing-table-wrap">
            <table class="pricing-table">
              <thead><tr><th>Color</th><th>Nombre</th><th>SKU</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </section>`;
      }).join('');
    }

    function openInkListModal(modelId, returnFocus){
      const m = data.find((x) => x.id === modelId);
      if (!m || !inkListModalEl) return;
      inkListModelId = m.id;
      inkListReturnFocus = returnFocus || document.activeElement;
      inkListTag = null;
      if (inkListTitleEl) inkListTitleEl.textContent = 'Tintas y SKU · ' + m.name;
      renderInkList();
      inkListModalEl.hidden = false;
      if (appShell) appShell.inert = true;
      const first = (inkSkuTagsEl && !inkSkuTagsEl.hidden) ? inkSkuTagsEl.querySelector('button') : inkListCloseEl;
      setTimeout(() => { if (first) { try { first.focus({ preventScroll: true }); } catch(ex){} } }, 10);
    }

    function closeInkListModal(){
      if (!inkListModalEl) return;
      inkListModalEl.hidden = true;
      if (appShell) appShell.inert = false;
      const back = inkListReturnFocus;
      inkListReturnFocus = null;
      inkListModelId = null;
      if (back && back.isConnected && back.getClientRects().length > 0){
        try { back.focus({ preventScroll: true }); } catch(ex){}
      }
    }

    if (inkListScrimEl) inkListScrimEl.addEventListener('click', closeInkListModal);
    if (inkListCloseEl) inkListCloseEl.addEventListener('click', closeInkListModal);
    if (inkListDoneEl) inkListDoneEl.addEventListener('click', closeInkListModal);
    if (inkSkuTagsEl){
      inkSkuTagsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-chip');
        if (!btn) return;
        inkListTag = btn.dataset.tag || '';
        renderInkList();
        const active = Array.from(inkSkuTagsEl.querySelectorAll('.filter-chip')).find((b) => b.dataset.tag === inkListTag);
        if (active) { try { active.focus({ preventScroll: true }); } catch(ex){} }
      });
    }
    installFocusTrap(inkListModalEl);

    // ===== MODAL EDITAR PRECIOS =====
    const editModalEl = document.getElementById('edit-modal');
    const editScrimEl = document.getElementById('edit-scrim');
    const editCloseEl = document.getElementById('edit-close');
    const editCancelEl = document.getElementById('edit-cancel');
    const editSaveEl = document.getElementById('edit-save');
    const editRestoreEl = document.getElementById('edit-restore');
    const editFieldsEl = document.getElementById('edit-fields');
    const editErrorEl = document.getElementById('edit-error');
    const editTrmHintEl = document.getElementById('edit-trm-hint');
    const editTitleEl = document.getElementById('edit-modal-title');

    const variantPricingModalEl = document.getElementById('variant-pricing-modal');
    const variantPricingScrimEl = document.getElementById('variant-pricing-scrim');
    const variantPricingCloseEl = document.getElementById('variant-pricing-close');
    const variantPricingCancelEl = document.getElementById('variant-pricing-cancel');
    const variantPricingApplyEl = document.getElementById('variant-pricing-apply');
    const variantPricingTitleEl = document.getElementById('variant-pricing-title');
    const variantPricingCanalEl = document.getElementById('variant-pricing-canal');
    const variantPricingMarginEl = document.getElementById('variant-pricing-margin');
    const variantPricingPvpEl = document.getElementById('variant-pricing-pvp');
    const variantPricingPvpSuffixEl = document.getElementById('variant-pricing-pvp-suffix');
    const variantPricingPreviewEl = document.getElementById('variant-pricing-preview');
    const variantPricingErrorEl = document.getElementById('variant-pricing-error');

    const fmtUsdPreview = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fmtCopPreview = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 2, maximumFractionDigits: 2 });

    let editModelId = null;
    let editReturnFocus = null;
    let editVariantState = {};
    let variantPricingVariantId = null;
    let variantPricingReturnFocus = null;

    // Moneda del formulario: la misma que muestra la vista.
    const editCurrency = () => (currency === 'COP' && getTrm()) ? 'Cop' : 'Usd';

    function toEditValue(usd){
      const amount = Number(usd) || 0;
      const trm = getTrm();
      if (currency === 'COP' && trm) return String(Math.round(amount * trm));
      return String(Math.round(amount * 100) / 100);
    }

    function editValueToUsd(raw){
      const n = parseAmount(raw);
      if (!Number.isFinite(n)) return NaN;
      const trm = getTrm();
      const usd = (currency === 'COP' && trm) ? n / trm : n;
      return Math.round(usd * 100) / 100;
    }

    // Vista previa en la moneda contraria (si hay TRM guardada).
    function previewText(usd){
      const amount = Number(usd);
      const trm = Number(manualTrm);
      if (!Number.isFinite(amount) || amount <= 0 || !(trm > 0)) return '';
      const raw = currency === 'COP'
        ? fmtUsdPreview.format(amount)
        : fmtCopPreview.format(amount * trm);
      return '= ' + raw.replace(/\./g, '').replace(/USD|COP/g, (m) => m === 'USD' ? 'Usd' : 'Cop');
    }

    function getModelCanalUsd(m){
      const n = Number(m && m.net_price_usd);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }

    function calcMarginPct(canalUsd, pvpUsd){
      const c = Number(canalUsd);
      const p = Number(pvpUsd);
      if (!(c > 0) || !Number.isFinite(p)) return 0;
      return ((p - c) / c) * 100;
    }

    function calcPvpFromMargin(canalUsd, marginPct){
      const c = Number(canalUsd);
      const m = Number(marginPct);
      if (!(c > 0) || !Number.isFinite(m)) return NaN;
      return Math.round(c * (1 + m / 100) * 100) / 100;
    }

    function fmtMarginPct(v){
      const n = Number(v);
      if (!Number.isFinite(n)) return '0';
      return String(Math.round(n * 100) / 100);
    }

    function editFieldHTML(field){
      const variantAttr = field.variantId ? ` data-variant-id="${esc(field.variantId)}"` : '';
      const inkAttr = field.inkId ? ` data-ink-id="${esc(field.inkId)}"` : '';
      return `<div class="edit-field">
        <label class="edit-label" for="${field.id}">${esc(field.label)}</label>
        <div class="edit-control">
          <input id="${field.id}" class="edit-input" type="text" inputmode="decimal" autocomplete="off"
            aria-describedby="${field.id}-preview"
            value="${esc(field.value)}" data-role="edit-input" data-kind="${field.kind}" data-index="${field.index}"${variantAttr}${inkAttr} />
          <span class="edit-suffix${field.kind === 'plan' ? ' plan-price-suffix' : ''}">${field.suffix || editCurrency()}</span>
        </div>
        <p class="edit-preview" id="${field.id}-preview" data-role="edit-preview"></p>
      </div>`;
    }

    function pricingEditIcon(){
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    }

    // Cada variante: canal (solo lectura), margen, PVP y descuento de tinta.
    function editPlanHTML(plan, i, basePrice, m){
      const discount = Number(plan.ink_discount_pct != null ? plan.ink_discount_pct : plan.ink_discount) || 0;
      const planPrice = plan.price_usd != null ? plan.price_usd : plan.price;
      const pvp = Number(editVariantState[plan.id] != null ? editVariantState[plan.id] : (planPrice != null ? planPrice : basePrice)) || 0;
      const canal = getModelCanalUsd(m);
      const margin = calcMarginPct(canal, pvp);
      const planTitle = String(plan.plan || plan.label || 'Plan').trim() || 'Plan';
      const planLabel = String(plan.label || '').trim();
      const showLabel = planLabel && planLabel !== planTitle;
      return `<div class="edit-plan" data-variant-id="${esc(plan.id)}">
        <p class="edit-plan-name">${esc(planTitle)}</p>
        ${showLabel ? `<p class="edit-plan-label">${esc(planLabel)}</p>` : ''}
        <div class="pricing-table-wrap">
          <table class="pricing-table">
            <thead><tr><th>Canal</th><th>Margen</th><th>PVP</th><th>Editar</th></tr></thead>
            <tbody>
              <tr>
                <td data-role="plan-canal">${esc(formatAmount(canal))}</td>
                <td data-role="plan-margin">${esc(fmtMarginPct(margin))}%</td>
                <td data-role="plan-pvp">${esc(formatAmount(pvp))}</td>
                <td><button type="button" class="pricing-edit-btn" data-role="edit-variant-pricing" data-variant-id="${esc(plan.id)}" aria-label="Editar margen y PVP de ${esc(planTitle)}" title="Editar margen y PVP">${pricingEditIcon()}</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        ${editFieldHTML({
          id: 'edit-plan-dto-' + i,
          label: 'Descuento en tinta (%)',
          value: String(Math.round(discount * 100) / 100),
          kind: 'plan-discount',
          index: i,
          variantId: plan.id,
          suffix: '%'
        })}
      </div>`;
    }

    // Precios de tinta tal como están ahora en el formulario (en USD).
    function inkPricesFromForm(){
      return Array.from(editFieldsEl.querySelectorAll('[data-kind="ink"]'))
        .map((input) => editValueToUsd(input.value))
        .filter((v) => Number.isFinite(v) && v > 0);
    }

    function discountPreview(pct, inkUsd){
      if (!Number.isFinite(pct) || pct < 0 || pct > 100 || !inkUsd.length) return '';
      if (!pct) return 'Sin descuento en tinta.';
      return 'Tinta: ' + inkUsd
        .map((v) => formatAmount(v * (1 - pct / 100)))
        .join(' · ');
    }

    function refreshFieldPreview(input){
      const field = input.closest('.edit-field');
      const preview = field && field.querySelector('[data-role="edit-preview"]');
      if (!preview) return;
      preview.textContent = input.dataset.kind === 'plan-discount'
        ? discountPreview(parseAmount(input.value), inkPricesFromForm())
        : previewText(editValueToUsd(input.value));
    }

    function refreshAllPreviews(){
      editFieldsEl.querySelectorAll('[data-role="edit-input"]').forEach(refreshFieldPreview);
    }

    // El nombre de la tinta ya suele incluir la capacidad ("T53K CMYK 1600 ml").
    function inkLabel(ink){
      const cap = ink.capacity_ml ? ink.capacity_ml + ' ml' : '';
      if (!cap) return ink.name;
      return String(ink.name).includes(cap) ? ink.name : ink.name + ' · ' + cap;
    }

    function renderEditFields(m){
      const groups = [];
      const variants = Array.isArray(m.variants) && m.variants.length ? m.variants : (Array.isArray(m.plans) ? m.plans : []);
      const basePrice = Number(m.base_price_usd != null ? m.base_price_usd : m.printer_price) || 0;
      editVariantState = {};
      variants.forEach((plan) => {
        const planPrice = plan.price_usd != null ? plan.price_usd : plan.price;
        editVariantState[plan.id] = Number(planPrice != null ? planPrice : basePrice) || basePrice;
      });

      if (variants.length){
        groups.push(`<section class="edit-group">
          <p class="edit-group-title">Planes / cobertura</p>
          <p class="edit-note">Canal no editable. Edita margen o PVP por variante; el descuento de tinta se aplica al simulador.</p>
          ${variants.map((plan, i) => editPlanHTML(plan, i, basePrice, m)).join('')}
        </section>`);
      } else {
        groups.push(`<section class="edit-group">
          <p class="edit-group-title">Hardware (PVP)</p>
          ${editFieldHTML({ id: 'edit-printer', label: 'Precio', value: toEditValue(basePrice), kind: 'printer', index: 0, variantId: '' })}
        </section>`);
      }

      if (Array.isArray(m.inks) && m.inks.length){
        groups.push(`<section class="edit-group">
          <p class="edit-group-title">Tintas (precio sin descuento)</p>
          ${m.inks.map((ink, i) => editFieldHTML({
            id: 'edit-ink-' + i,
            label: inkLabel(ink),
            value: toEditValue(ink.price_usd != null ? ink.price_usd : ink.price),
            kind: 'ink',
            index: i,
            inkId: ink.id
          })).join('')}
        </section>`);
      }

      editFieldsEl.innerHTML = groups.join('');
      refreshAllPreviews();
    }

    function openEditModal(id){
      const m = data.find((x) => x.id === id);
      if (!m || !editModalEl) return;
      if (variantPricingModalEl && !variantPricingModalEl.hidden) closeVariantPricingModal();
      editModelId = m.id;
      // Si el modal se abrió sin foco en el lápiz (clic programático, teclado), vuelve al lápiz.
      editReturnFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('card-edit')
        ? document.activeElement
        : stage.querySelector('.card-edit');
      resetPageScroll();
      if (editTitleEl) editTitleEl.textContent = 'Editar precios · ' + m.name;
      renderEditFields(m);
      if (editErrorEl) editErrorEl.hidden = true;
      if (editRestoreEl) editRestoreEl.hidden = !overrides[m.id];
      if (editTrmHintEl){
        const trm = Number(manualTrm);
        const showTrm = currency === 'COP' && trm > 0;
        editTrmHintEl.hidden = !showTrm;
        editTrmHintEl.textContent = showTrm ? 'TRM aplicada: ' + fmtCopPreview.format(trm).replace(/\./g, '') + ' por Usd.' : '';
      }
      editModalEl.hidden = false;
      if (appShell) appShell.inert = true;
      const first = editFieldsEl.querySelector('input');
      setTimeout(() => {
        if (first){ try { first.focus({ preventScroll: true }); first.select(); } catch(ex){} }
      }, 10);
    }

    function closeEditModal(){
      if (!editModalEl) return;
      if (variantPricingModalEl && variantPricingModalEl.hidden === false) {
        variantPricingModalEl.hidden = true;
        variantPricingVariantId = null;
        variantPricingReturnFocus = null;
      }
      editModalEl.hidden = true;
      if (appShell) appShell.inert = false;
      const back = editReturnFocus;
      if (back && back.isConnected && back.getClientRects().length > 0){
        try { back.focus({ preventScroll: true }); } catch(ex){}
      }
      editReturnFocus = null;
      resetPageScroll();
    }

    // Tras guardar/restaurar la tarjeta se reconstruye: foco al lápiz nuevo y aviso accesible.
    function afterPricesChanged(){
      rerenderCurrentView();
      const btn = stage.querySelector('.card-edit');
      if (btn){ try { btn.focus({ preventScroll: true }); } catch(ex){} }
      const status = stage.querySelector('[data-role="status"]');
      if (status) status.textContent = 'Precios actualizados.';
      resetPageScroll();
    }

    const nearAmount = (a, b) => Math.abs(Number(a) - Number(b)) <= 0.004;

    function saveEdit(){
      const m = data.find((x) => x.id === editModelId);
      if (!m) return;
      const source = models.find((x) => x.id === m.id);
      if (!source) return;

      const inputs = Array.from(editFieldsEl.querySelectorAll('[data-role="edit-input"]'));
      let firstBad = null;
      let firstBadMessage = '';

      const values = inputs.map((input) => {
        const kind = input.dataset.kind;
        if (kind === 'plan-discount'){
          const pct = parseAmount(input.value);
          const ok = Number.isFinite(pct) && pct >= 0 && pct <= 100;
          input.setAttribute('aria-invalid', ok ? 'false' : 'true');
          if (!ok && !firstBad){
            firstBad = input;
            firstBadMessage = 'El descuento de tinta debe estar entre 0 y 100 %.';
          }
          return { input, kind, pct, usd: NaN };
        }
        const usd = editValueToUsd(input.value);
        const ok = Number.isFinite(usd) && usd > 0 && usd <= 1000000000;
        input.setAttribute('aria-invalid', ok ? 'false' : 'true');
        if (!ok && !firstBad){
          firstBad = input;
          firstBadMessage = 'Los precios deben ser números mayores que 0.';
        }
        return { input, kind, pct: NaN, usd };
      });

      if (firstBad){
        if (editErrorEl){
          editErrorEl.textContent = firstBadMessage;
          editErrorEl.hidden = false;
        }
        try { firstBad.focus({ preventScroll: true }); firstBad.select(); } catch(ex){}
        return;
      }

      const next = { base_price_usd: undefined, variants: {}, inks: {} };
      const srcBase = Number(source.base_price_usd != null ? source.base_price_usd : source.printer_price) || 0;

      values.forEach(({ input, kind, pct, usd }) => {
        const variantId = input.dataset.variantId || '';
        const inkId = input.dataset.inkId || '';
        const srcVariant = variantId ? PM.getVariantById(source, variantId) : null;
        const srcInk = inkId ? (source.inks || []).find((i) => i.id === inkId) : null;

        if (kind === 'printer'){
          if (!nearAmount(srcBase, usd)) next.base_price_usd = usd;
          if (srcVariant) {
            const baseEffective = PM.getEffectivePrice(source, srcVariant);
            if (!nearAmount(baseEffective, usd)) {
              next.variants[variantId] = { ...(next.variants[variantId] || {}), price_usd: usd };
            }
          }
          return;
        }

        if (kind === 'plan-discount' && srcVariant){
          const srcDiscount = PM.getEffectiveInkDiscount(source, srcVariant);
          if (!nearAmount(srcDiscount, pct)) {
            next.variants[variantId] = { ...(next.variants[variantId] || {}), ink_discount_pct: pct };
          }
          return;
        }

        if (kind === 'ink' && srcInk){
          const srcPrice = Number(srcInk.price_usd != null ? srcInk.price_usd : srcInk.price) || 0;
          if (!nearAmount(srcPrice, usd)) next.inks[inkId] = { price_usd: usd };
        }
      });

      // Precios por variante desde el estado del submodal de margen/PVP.
      (source.variants || []).forEach((srcVariant, idx) => {
        if (!srcVariant || !srcVariant.id) return;
        const variantId = srcVariant.id;
        const hasState = Object.prototype.hasOwnProperty.call(editVariantState, variantId);
        if (!hasState) return;
        const usd = Number(editVariantState[variantId]);
        if (!Number.isFinite(usd) || usd <= 0 || usd > 1000000000) {
          if (editErrorEl){
            editErrorEl.textContent = 'El PVP de cada variante debe ser mayor que 0.';
            editErrorEl.hidden = false;
          }
          return;
        }
        const srcEffective = PM.getEffectivePrice(source, srcVariant);
        const isFirst = idx === 0;
        if (isFirst) {
          if (!nearAmount(srcBase, usd)) next.base_price_usd = usd;
          const srcExplicit = srcVariant.price_usd != null ? Number(srcVariant.price_usd) : null;
          if (srcExplicit != null) {
            if (!nearAmount(srcExplicit, usd)) next.variants[variantId] = { ...(next.variants[variantId] || {}), price_usd: usd };
          } else if (!nearAmount(srcBase, usd)) {
            next.variants[variantId] = { ...(next.variants[variantId] || {}), price_usd: usd };
          }
        } else if (!nearAmount(srcEffective, usd)) {
          next.variants[variantId] = { ...(next.variants[variantId] || {}), price_usd: usd };
        }
      });
      if (editErrorEl && !editErrorEl.hidden) return;

      if (next.base_price_usd === undefined) delete next.base_price_usd;
      if (!Object.keys(next.variants).length) delete next.variants;
      if (!Object.keys(next.inks).length) delete next.inks;
      if (Object.keys(next).length) overrides[m.id] = next;
      else delete overrides[m.id];
      persistOverrides();

      resetModelFromSource(m.id);
      if (variantPricingModalEl) { variantPricingModalEl.hidden = true; variantPricingVariantId = null; variantPricingReturnFocus = null; }
      editModalEl.hidden = true;
      if (appShell) appShell.inert = false;
      editReturnFocus = null;
      afterPricesChanged();
    }

    function restoreEdit(){
      const m = data.find((x) => x.id === editModelId);
      if (!m) return;
      delete overrides[m.id];
      persistOverrides();
      resetModelFromSource(m.id);
      if (variantPricingModalEl) { variantPricingModalEl.hidden = true; variantPricingVariantId = null; variantPricingReturnFocus = null; }
      editModalEl.hidden = true;
      if (appShell) appShell.inert = false;
      editReturnFocus = null;
      afterPricesChanged();
    }

    function refreshVariantPricingRow(variantId){
      if (!editFieldsEl) return;
      const m = data.find((x) => x.id === editModelId);
      if (!m) return;
      const plan = (m.variants || []).find((v) => v && v.id === variantId);
      if (!plan) return;
      const row = editFieldsEl.querySelector('.edit-plan[data-variant-id="' + CSS.escape(variantId) + '"]');
      if (!row) return;
      const canal = getModelCanalUsd(m);
      const pvp = Number(editVariantState[variantId]);
      const margin = calcMarginPct(canal, pvp);
      const canalEl = row.querySelector('[data-role="plan-canal"]');
      const marginEl = row.querySelector('[data-role="plan-margin"]');
      const pvpEl = row.querySelector('[data-role="plan-pvp"]');
      if (canalEl) canalEl.textContent = formatAmount(canal);
      if (marginEl) marginEl.textContent = fmtMarginPct(margin) + '%';
      if (pvpEl) pvpEl.textContent = formatAmount(pvp);
    }

    function openVariantPricingModal(variantId, returnFocus){
      const m = data.find((x) => x.id === editModelId);
      if (!m || !variantPricingModalEl) return;
      const plan = (m.variants || []).find((v) => v && v.id === variantId);
      if (!plan) return;
      variantPricingVariantId = variantId;
      variantPricingReturnFocus = returnFocus || document.activeElement;
      const canal = getModelCanalUsd(m);
      const pvpUsd = Number(editVariantState[variantId]);
      const margin = calcMarginPct(canal, pvpUsd);
      if (variantPricingTitleEl) variantPricingTitleEl.textContent = 'Editar precio · ' + (plan.plan || plan.label || 'Plan');
      const rawCanal = fmtUsdPreview.format(canal);
      if (variantPricingCanalEl) variantPricingCanalEl.value = rawCanal.replace(/\./g, '').replace(/USD|COP/g, (m) => m === 'USD' ? 'Usd' : 'Cop');
      if (variantPricingMarginEl) {
        variantPricingMarginEl.value = fmtMarginPct(margin);
        variantPricingMarginEl.disabled = !(canal > 0);
      }
      if (variantPricingPvpEl) variantPricingPvpEl.value = toEditValue(pvpUsd);
      if (variantPricingPvpSuffixEl) variantPricingPvpSuffixEl.textContent = editCurrency();
      if (variantPricingPreviewEl) variantPricingPreviewEl.textContent = previewText(pvpUsd);
      if (variantPricingErrorEl) variantPricingErrorEl.hidden = true;
      variantPricingModalEl.hidden = false;
      const first = (canal > 0 ? variantPricingMarginEl : variantPricingPvpEl) || variantPricingPvpEl;
      setTimeout(() => { if (first) { try { first.focus({ preventScroll: true }); first.select(); } catch(ex){} } }, 10);
    }

    function closeVariantPricingModal(){
      if (!variantPricingModalEl) return;
      variantPricingModalEl.hidden = true;
      variantPricingVariantId = null;
      const back = variantPricingReturnFocus;
      variantPricingReturnFocus = null;
      if (back && back.isConnected && back.getClientRects().length > 0){
        try { back.focus({ preventScroll: true }); } catch(ex){}
      }
    }

    function syncVariantPricingFromMargin(){
      const m = data.find((x) => x.id === editModelId);
      if (!m) return;
      const canal = getModelCanalUsd(m);
      if (!(canal > 0)) return;
      const margin = parseAmount(variantPricingMarginEl ? variantPricingMarginEl.value : '');
      if (!Number.isFinite(margin)) return;
      const pvpUsd = calcPvpFromMargin(canal, margin);
      if (!Number.isFinite(pvpUsd)) return;
      if (variantPricingPvpEl) variantPricingPvpEl.value = toEditValue(pvpUsd);
      if (variantPricingPreviewEl) variantPricingPreviewEl.textContent = previewText(pvpUsd);
    }

    function syncVariantPricingFromPvp(){
      const m = data.find((x) => x.id === editModelId);
      if (!m) return;
      const canal = getModelCanalUsd(m);
      const pvpUsd = editValueToUsd(variantPricingPvpEl ? variantPricingPvpEl.value : '');
      if (variantPricingPreviewEl) variantPricingPreviewEl.textContent = previewText(pvpUsd);
      if (!(canal > 0) || !Number.isFinite(pvpUsd)) return;
      if (variantPricingMarginEl) variantPricingMarginEl.value = fmtMarginPct(calcMarginPct(canal, pvpUsd));
    }

    function applyVariantPricing(){
      const m = data.find((x) => x.id === editModelId);
      if (!m || !variantPricingVariantId) return;
      const canal = getModelCanalUsd(m);
      const pvpUsd = editValueToUsd(variantPricingPvpEl ? variantPricingPvpEl.value : '');
      const margin = parseAmount(variantPricingMarginEl ? variantPricingMarginEl.value : '');
      let msg = '';
      if (!Number.isFinite(pvpUsd) || pvpUsd <= 0 || pvpUsd > 1000000000) msg = 'El PVP debe ser un número mayor que 0.';
      if (!msg && canal > 0 && !Number.isFinite(margin)) msg = 'El margen debe ser un número válido.';
      if (msg){
        if (variantPricingErrorEl){ variantPricingErrorEl.textContent = msg; variantPricingErrorEl.hidden = false; }
        return;
      }
      editVariantState[variantPricingVariantId] = Math.round(pvpUsd * 100) / 100;
      refreshVariantPricingRow(variantPricingVariantId);
      closeVariantPricingModal();
      if (editErrorEl) editErrorEl.hidden = true;
    }

    if (editScrimEl) editScrimEl.addEventListener('click', closeEditModal);
    if (editCloseEl) editCloseEl.addEventListener('click', closeEditModal);
    if (editCancelEl) editCancelEl.addEventListener('click', closeEditModal);
    if (editSaveEl) editSaveEl.addEventListener('click', saveEdit);
    if (editRestoreEl) editRestoreEl.addEventListener('click', restoreEdit);

    if (editFieldsEl){
      editFieldsEl.addEventListener('input', (e) => {
        const input = e.target.closest('[data-role="edit-input"]');
        if (!input) return;
        input.setAttribute('aria-invalid', 'false');
        if (editErrorEl) editErrorEl.hidden = true;
        refreshAllPreviews();
      });
      editFieldsEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter'){ e.preventDefault(); saveEdit(); }
      });
      editFieldsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-role="edit-variant-pricing"]');
        if (!btn) return;
        e.preventDefault();
        openVariantPricingModal(btn.dataset.variantId || '', btn);
      });
    }

    if (variantPricingScrimEl) variantPricingScrimEl.addEventListener('click', closeVariantPricingModal);
    if (variantPricingCloseEl) variantPricingCloseEl.addEventListener('click', closeVariantPricingModal);
    if (variantPricingCancelEl) variantPricingCancelEl.addEventListener('click', closeVariantPricingModal);
    if (variantPricingApplyEl) variantPricingApplyEl.addEventListener('click', applyVariantPricing);
    if (variantPricingMarginEl) variantPricingMarginEl.addEventListener('input', () => { if (variantPricingErrorEl) variantPricingErrorEl.hidden = true; syncVariantPricingFromMargin(); });
    if (variantPricingPvpEl) variantPricingPvpEl.addEventListener('input', () => { if (variantPricingErrorEl) variantPricingErrorEl.hidden = true; syncVariantPricingFromPvp(); });
    if (variantPricingModalEl) variantPricingModalEl.addEventListener('keydown', (e) => { if (e.key === 'Enter'){ e.preventDefault(); applyVariantPricing(); } });

    installFocusTrap(editModalEl);
    installFocusTrap(variantPricingModalEl);

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (variantPricingModalEl && variantPricingModalEl.hidden === false){ e.preventDefault(); closeVariantPricingModal(); return; }
      if (editModalEl && editModalEl.hidden === false){ e.preventDefault(); closeEditModal(); return; }
      if (inkListModalEl && inkListModalEl.hidden === false){ e.preventDefault(); closeInkListModal(); return; }
      if (trmModalEl && trmModalEl.hidden === false){ e.preventDefault(); cancelTrmModal(); }
    });

    if (currencyToggleBtn){
      currencyToggleBtn.addEventListener('click', () => {
        setCurrency(currency === 'COP' ? 'USD' : 'COP');
      });
    }

    // Pulsar las etiquetas USD / COP también cambia la moneda.
    document.querySelectorAll('.currency-label[data-currency]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.currency === 'COP' ? 'COP' : 'USD';
        if (target !== currency) setCurrency(target);
      });
    });

    syncCurrencyUI();

    // ARRANQUE
    data.forEach((m) => {
      const link = document.createElement('a');
      link.className = 'model-btn';
      link.href = '#' + m.id;
      link.dataset.id = m.id;
      link.dataset.search = normalize(m.name);
      link.dataset.category = String(m.category || '').trim();
      link.innerHTML = `<span>${esc(m.name)}</span>` +
        (m.fair_price > 0 ? '<span class="chip">Oferta</span>' : '');
      picker.appendChild(link);
    });

    renderCategoryFilters();
    filterModels();
    syncInert();
    route();

    window.addEventListener('hashchange', () => {
      if (menuOpen) closeMenu({ restoreFocus: false });
      route({ focus: true });
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        const showUpdateToast = (registration) => {
          const toast = document.getElementById('update-toast');
          const applyBtn = document.getElementById('update-apply');
          const dismissBtn = document.getElementById('update-dismiss');
          if (!toast || !registration || !registration.waiting) return;
          toast.hidden = false;
          if (applyBtn) applyBtn.onclick = () => {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          };
          if (dismissBtn) dismissBtn.onclick = () => { toast.hidden = true; };
        };

        navigator.serviceWorker.register('./sw.js', { scope: './' }).then((registration) => {
          if (registration.waiting) showUpdateToast(registration);
          registration.addEventListener('updatefound', () => {
            const nw = registration.installing;
            if (!nw) return;
            nw.addEventListener('statechange', () => {
              if (nw.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(registration);
              }
            });
          });
        }).catch((err) => {
          console.warn('[PWA] No se pudo registrar el Service Worker:', err);
        });

        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      });
    }
  