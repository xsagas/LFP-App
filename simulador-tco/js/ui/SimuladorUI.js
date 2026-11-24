(function (global) {
  'use strict';

  const { FormatoEs, TintaService, TCOCalculator, PaybackService, createChartManager, ValidationError } = global.CTTCO;

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // avoid for untrusted; used minimally
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else if (v === false || v == null) { /* skip */ }
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children || []).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  function num(v, def) { const n = Number(v); return Number.isFinite(n) ? n : (def == null ? 0 : def); }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  // Fallback mínimo si colors.js no está disponible.
  const FALLBACK_COLORS = {
    C: { name: 'Cyan', hex: '#00FFFF' },
    M: { name: 'Magenta', hex: '#FF00FF' },
    Y: { name: 'Yellow', hex: '#FFFF00' },
    K: { name: 'Black', hex: '#000000' },
    HDK: { name: 'HD Black', hex: '#000000' },
    Wh: { name: 'White', hex: '#FFFFFF' },
    Mk: { name: 'Matte Black', hex: '#1A1A1A' },
    Pk: { name: 'Photo Black', hex: '#0B0B0B' },
    R: { name: 'Red', hex: '#FF0000' }
  };

  function colorCatalog() {
    return global.PRICELIST_COLORS || FALLBACK_COLORS;
  }

  function colorInfo(code) {
    const key = String(code == null ? '' : code).trim();
    const catalog = colorCatalog();
    if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
    const found = Object.keys(catalog).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found) return catalog[found];
    return { name: key, hex: '#cccccc' };
  }

  function createUI(container, store, host, initialDisplay) {
    let displayState = normalizeDisplay(initialDisplay);

    function normalizeDisplay(d) {
      const src = d || {};
      const currency = src.currency === 'COP' ? 'COP' : 'USD';
      const trm = Number(src.trm);
      const activeTrm = (currency === 'COP' && Number.isFinite(trm) && trm > 0) ? trm : null;
      return { currency: activeTrm ? 'COP' : 'USD', trm: activeTrm };
    }

    function getDisplay() { return displayState; }
    function currencyCode() { return getDisplay().currency; }
    function toDisplayAmount(usd) {
      const d = getDisplay();
      const n = Number(usd) || 0;
      return d.currency === 'COP' ? n * d.trm : n;
    }
    function fmtMoney(usd, usdDecimals, copDecimals) {
      const d = getDisplay();
      const v = toDisplayAmount(usd);
      const dec = d.currency === 'COP' ? (copDecimals != null ? copDecimals : 2) : (usdDecimals != null ? usdDecimals : 2);
      const curLabel = d.currency === 'COP' ? 'Cop' : 'Usd';
      const formatted = FormatoEs.fmtEs(v, dec).replace(/\./g, '');
      return curLabel + ' ' + formatted;
    }
    function fmtMoneyUnit(usd, usdDecimals, copDecimals) {
      const d = getDisplay();
      const v = toDisplayAmount(usd);
      const dec = d.currency === 'COP' ? (copDecimals != null ? copDecimals : 2) : (usdDecimals != null ? usdDecimals : 2);
      const curLabel = d.currency === 'COP' ? 'Cop' : 'Usd';
      const formatted = FormatoEs.fmtEs(v, dec).replace(/\./g, '');
      return curLabel + ' ' + formatted;
    }
    function fmtUnit2(usd) {
      const d = getDisplay();
      const v = toDisplayAmount(usd);
      const dec = 2;
      return FormatoEs.fmtEs(v, dec).replace(/\./g, '');
    }
    const state = store.state;
    const catalogo = () => store.getCatalogo();

    container.classList.add('ct-tco');
    container.innerHTML = '';

    const root = el('div', { class: 'ct-tco-root' });
    container.appendChild(root);

    // Structure
    const kpiSection = el('section', { class: 'ct-tco-section', 'aria-label': 'Resumen del equipo' });
    const form = el('form', { id: 'ct-form-tco', class: 'ct-tco-form', novalidate: true });
    const resultados = el('div', { id: 'ct-resultados', class: 'ct-tco-resultados', 'aria-live': 'polite', 'aria-atomic': 'true' });
    const paybackCard = el('div', { id: 'ct-card-payback', class: 'ct-tco-card ct-tco-payback d-none' });
    root.append(kpiSection, form, resultados, paybackCard);

    // KPI: solo uso de tinta, con botón editar.
    const kpiGrid = el('div', { class: 'ct-tco-kpis' });
    const kpiUso = makeUsoKpi();
    kpiGrid.appendChild(kpiUso.card);
    kpiSection.appendChild(kpiGrid);

    function makeUsoKpi() {
      const title = el('div', { class: 'ct-tco-kpi-title', text: 'USO DE TINTA (ml/m²)' });
      const value = el('div', { class: 'ct-tco-kpi-value', text: '—' });
      const btnEdit = el('button', {
        type: 'button',
        class: 'ct-tco-icon-btn',
        title: 'Editar uso de tinta',
        'aria-label': 'Editar uso de tinta por color',
        'aria-haspopup': 'dialog',
        'aria-controls': 'ct-modal-uso-tinta'
      });
      btnEdit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      btnEdit.addEventListener('click', openUsoModal);
      const head = el('div', { class: 'ct-tco-kpi-head' }, [title, btnEdit]);
      const card = el('div', { class: 'ct-tco-card ct-tco-kpi ct-tco-kpi-uso' }, [head, value]);
      return { card, value, title, btnEdit };
    }

    function unidadConsumo(eq) {
      return (eq && eq.tipo === 'DTG') ? 'ml/Und' : 'ml/m²';
    }

    function updateKpiLabels(eq) {
      const unit = unidadConsumo(eq);
      kpiUso.title.textContent = 'USO DE TINTA (' + unit + ')';
      kpiUso.card.dataset.unit = unit;
    }

    // Form fields
    const selVariante = el('select', { id: 'ct-sim-variante', class: 'ct-tco-control' });
    const selModo = el('select', { id: 'ct-sim-modo', class: 'ct-tco-control' });
    const selPapel = el('select', { id: 'ct-sim-papel', class: 'ct-tco-control' });
    const inpMetros = el('input', { id: 'ct-sim-metros-mes', class: 'ct-tco-control ct-campo-decimal', type: 'text', inputmode: 'decimal' });
    const inpHoras = el('input', { id: 'ct-sim-horas-dia', class: 'ct-tco-control ct-campo-decimal', type: 'text', inputmode: 'decimal' });

    const btnCalcular = el('button', { id: 'ct-btn-calcular', type: 'submit', class: 'ct-tco-btn ct-tco-btn-primary', text: 'Calcular Costo' });
    const btnGuardar = el('button', { id: 'ct-btn-guardar-escenario', type: 'button', class: 'ct-tco-btn ct-tco-btn-secondary', text: 'Guardar escenario' });
    btnGuardar.style.display = 'none';

    const grid = el('div', { class: 'ct-tco-form-grid' }, [
      field('Variante / Plan', 'ct-sim-variante', selVariante),
      field('Modo de impresión', 'ct-sim-modo', selModo),
      field('Sustrato / Papel', 'ct-sim-papel', selPapel),
      field('Producción mensual', 'ct-sim-metros-mes', inpMetros),
      field('Horas por día', 'ct-sim-horas-dia', inpHoras)
    ]);

    const actions = el('div', { class: 'ct-tco-actions' }, [btnCalcular, btnGuardar]);
    form.append(grid, actions);

    function field(labelText, forId, control) {
      const wrap = el('div', { class: 'ct-tco-field' }, [
        el('label', { for: forId, class: 'ct-tco-label', text: labelText }),
        control
      ]);
      return wrap;
    }

    // ---------------------------------------------------------------------
    // Uso de tinta por color
    // ---------------------------------------------------------------------
    function getEquipoColors(eq) {
      const seen = Object.create(null);
      const out = [];
      function add(code) {
        const c = String(code == null ? '' : code).trim();
        if (!c) return;
        const key = c.toLowerCase();
        if (seen[key]) return;
        seen[key] = true;
        out.push(c);
      }
      const groups = (eq && Array.isArray(eq.ink_skus)) ? eq.ink_skus : [];
      groups.forEach((g) => {
        ((g && g.inks) || []).forEach((ink) => add(ink && ink.color));
      });
      if (out.length === 0) {
        ((eq && eq.tintas) || []).forEach((t) => add(t && t.color_code));
      }
      return out;
    }

    function usoTotal() {
      const values = state.usoTintaPorColor || {};
      return Object.keys(values).reduce((acc, key) => acc + num(values[key]), 0);
    }

    function getConsumoEfectivo(eq) {
      const total = usoTotal();
      if (total > 0) return total;
      const modo = (eq && eq.modos || [])[state.modoIndex] || {};
      return num(modo.consumo_ml_m2);
    }

    function updateKpisForEquipo(eq) {
      if (!eq) return;
      updateKpiLabels(eq);
      const consumo = getConsumoEfectivo(eq);
      kpiUso.value.textContent = consumo > 0 ? FormatoEs.fmtEs(consumo, 2) : '—';
    }

    // Modal (creado una sola vez dentro del contenedor del simulador).
    const modal = buildUsoModal();

    function buildUsoModal() {
      const titleId = 'ct-modal-uso-tinta-title';
      const helpId = 'ct-modal-uso-tinta-help';
      const rows = el('div', { class: 'ct-tco-modal-body', id: 'ct-modal-uso-tinta-rows' });
      const total = el('div', { class: 'ct-tco-modal-total', id: 'ct-modal-uso-tinta-total', 'aria-live': 'polite', text: 'Total: 0' });
      const help = el('p', { class: 'ct-tco-muted ct-tco-modal-help', id: helpId });

      const btnClose = el('button', { type: 'button', class: 'ct-tco-modal-close', 'aria-label': 'Cerrar', title: 'Cerrar', text: '×' });
      const btnCancel = el('button', { type: 'button', class: 'ct-tco-btn ct-tco-btn-secondary', text: 'Cancelar' });
      const btnMode = el('button', { type: 'button', class: 'ct-tco-btn ct-tco-btn-secondary', text: 'Usar consumo del modo' });
      const btnSave = el('button', { type: 'button', class: 'ct-tco-btn ct-tco-btn-primary', text: 'Guardar' });

      const dialog = el('div', {
        class: 'ct-tco-modal-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
        'aria-describedby': helpId,
        tabindex: '-1'
      }, [
        el('div', { class: 'ct-tco-modal-head' }, [
          el('h3', { class: 'ct-tco-modal-title', id: titleId, text: 'Uso de tinta por color' }),
          btnClose
        ]),
        help,
        rows,
        total,
        el('div', { class: 'ct-tco-modal-actions' }, [btnMode, btnCancel, btnSave])
      ]);

      const backdrop = el('div', { class: 'ct-tco-modal-backdrop' });
      const overlay = el('div', { class: 'ct-tco-modal', id: 'ct-modal-uso-tinta', hidden: true }, [backdrop, dialog]);
      // Portal a <body>: el overlay queda fuera del contenedor con scroll y de .app,
      // de modo que position:fixed no depende de ancestros y se puede inertizar el fondo.
      document.body.appendChild(overlay);

      btnClose.addEventListener('click', closeUsoModal);
      btnCancel.addEventListener('click', closeUsoModal);
      backdrop.addEventListener('click', closeUsoModal);
      btnSave.addEventListener('click', saveUsoModal);
      btnMode.addEventListener('click', useModoConsumo);
      overlay.addEventListener('keydown', onModalKeydown);

      return { overlay, dialog, rows, total, help, btnSave };
    }

    function onModalKeydown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeUsoModal();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusables = modal.dialog.querySelectorAll('button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function fmtInputValue(v) {
      if (v == null || v === '') return '';
      const n = Number(v);
      if (!Number.isFinite(n)) return '';
      return String(n).replace('.', ',');
    }

    function buildUsoRows(eq) {
      clear(modal.rows);
      const colors = getEquipoColors(eq);
      const unit = unidadConsumo(eq);
      if (colors.length === 0) {
        modal.rows.appendChild(el('p', { class: 'ct-tco-muted', text: 'Este equipo no tiene tintas configuradas.' }));
        return;
      }
      colors.forEach((code) => {
        const info = colorInfo(code);
        const current = state.usoTintaPorColor && state.usoTintaPorColor[code] != null
          ? state.usoTintaPorColor[code]
          : '';
        const input = el('input', {
          type: 'text',
          class: 'ct-tco-control ct-campo-decimal ct-tco-uso-input',
          inputmode: 'decimal',
          'data-color': code,
          value: fmtInputValue(current),
          'aria-label': 'Uso de tinta ' + info.name + ' (' + unit + ')'
        });
        input.addEventListener('input', () => {
          input.classList.remove('ct-tco-input-error');
          updateModalTotal();
        });
        modal.rows.appendChild(el('div', { class: 'ct-tco-uso-row' }, [
          el('span', { class: 'ct-tco-color-dot', style: 'background:' + info.hex, 'aria-hidden': 'true' }),
          el('span', { class: 'ct-tco-uso-code', title: info.name, text: code }),
          input,
          el('span', { class: 'ct-tco-uso-unit', text: unit })
        ]));
      });
    }

    function updateModalTotal() {
      const inputs = modal.rows.querySelectorAll('input[data-color]');
      let total = 0;
      inputs.forEach((inp) => {
        const raw = (inp.value || '').trim();
        if (raw === '' || !FormatoEs.esDecimalValido(raw)) return;
        total += num(FormatoEs.parseDecimalEs(raw));
      });
      const unit = unidadConsumo(store.getEquipoActivo());
      const suffix = total > 0 ? '' : ' · se usará el consumo del modo';
      modal.total.textContent = 'Total: ' + FormatoEs.fmtEs(total, 2) + ' ' + unit + suffix;
    }

    let lastFocused = null;

    // ---------------------------------------------------------------------
    // Bloqueo de scroll del fondo + restauración de posición
    // ---------------------------------------------------------------------
    const MODAL_OPEN_CLASS = 'ct-tco-modal-open';
    let modalScroll = null;
    let bgLocked = false;

    function scrollHost() {
      return document.getElementById('stage-scroll')
        || document.scrollingElement
        || document.documentElement;
    }

    function lockBackground() {
      const host = scrollHost();
      modalScroll = host ? { top: host.scrollTop, left: host.scrollLeft } : null;
      document.body.classList.add(MODAL_OPEN_CLASS);
      const shell = document.querySelector('.app');
      if (shell) shell.inert = true;
      bgLocked = true;
    }

    function unlockBackground(restore) {
      // No tocar el estado del fondo si el bloqueo lo gestiona otro modal (p. ej. TRM).
      if (!bgLocked) return;
      const host = scrollHost();
      document.body.classList.remove(MODAL_OPEN_CLASS);
      const shell = document.querySelector('.app');
      if (shell) shell.inert = false;
      if (restore && host && modalScroll) {
        // Safari puede desplazar el contenedor al enfocar un input: se devuelve a su sitio.
        host.scrollTop = modalScroll.top;
        host.scrollLeft = modalScroll.left;
      }
      modalScroll = null;
      bgLocked = false;
      if (document.documentElement.scrollLeft) document.documentElement.scrollLeft = 0;
      if (document.body && document.body.scrollLeft) document.body.scrollLeft = 0;
    }

    function openUsoModal() {
      const eq = store.getEquipoActivo();
      if (!eq) return;
      lastFocused = document.activeElement;
      const unit = unidadConsumo(eq);
      modal.help.textContent = 'Define el uso de tinta por color (' + unit + '). Si el total es 0 se usará el consumo del modo seleccionado.';
      buildUsoRows(eq);
      updateModalTotal();
      lockBackground();
      modal.overlay.hidden = false;
      modal.overlay.scrollTop = 0;
      const firstInput = modal.rows.querySelector('input');
      const target = firstInput || modal.dialog;
      // preventScroll: el foco no debe mover el documento ni el contenedor de fondo.
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }

    function closeUsoModal() {
      modal.overlay.hidden = true;
      unlockBackground(true);
      if (lastFocused && typeof lastFocused.focus === 'function') {
        try { lastFocused.focus({ preventScroll: true }); } catch (e) {}
      }
      lastFocused = null;
    }

    function readUsoInputs() {
      const inputs = modal.rows.querySelectorAll('input[data-color]');
      const values = {};
      let invalid = null;
      for (let i = 0; i < inputs.length; i += 1) {
        const inp = inputs[i];
        const raw = (inp.value || '').trim();
        let v = 0;
        if (raw !== '') {
          if (!FormatoEs.esDecimalValido(raw)) {
            invalid = inp;
            break;
          }
          v = FormatoEs.parseDecimalEs(raw);
          if (!(v >= 0)) {
            invalid = inp;
            break;
          }
        }
        values[inp.dataset.color] = v;
      }
      return { values, invalid };
    }

    function saveUsoModal() {
      const parsed = readUsoInputs();
      if (parsed.invalid) {
        parsed.invalid.classList.add('ct-tco-input-error');
        parsed.invalid.focus();
        return;
      }
      state.usoTintaPorColor = parsed.values;
      state.agregarUsoTinta = usoTotal() > 0;
      updateKpisForEquipo(store.getEquipoActivo());
      closeUsoModal();
    }

    function useModoConsumo() {
      state.usoTintaPorColor = {};
      state.agregarUsoTinta = false;
      updateKpisForEquipo(store.getEquipoActivo());
      closeUsoModal();
    }

    // Payback UI
    buildPaybackUI();

    function buildPaybackUI() {
      paybackCard.innerHTML = '';
      const title = el('h3', { class: 'ct-tco-card-title', text: 'PayBack Descontado' });
      const controls = el('div', { class: 'ct-tco-payback-controls' });
      const margenGroup = inputGroup('Margen (%)', 'ct-pb-margen', '30', '0,5', '0', '95');
      const tasaGroup = inputGroup('Tasa Descuento Anual (%)', 'ct-pb-tasa', '6,5', '0,5', '0', '100');
      controls.append(margenGroup.wrap, tasaGroup.wrap);

      const mini = el('div', { class: 'ct-tco-payback-kpis' });
      const pbInv = miniKpi('Inversión inicial'); const pbVol = miniKpi('Volumen mensual');
      const pbMargen = miniKpi('Margen mensual'); const pbRoi = miniKpi('Retorno ROI');
      pbMargen.labelEl = pbMargen.card.querySelector('.ct-tco-mini-label');
      mini.append(pbInv.card, pbVol.card, pbMargen.card, pbRoi.card);

      const chartWrap = el('div', { class: 'ct-tco-chart-wrap' });
      const canvas = el('canvas', { id: 'ct-payback-chart', role: 'img', 'aria-label': 'Evolución del PayBack descontado', 'aria-describedby': 'ct-payback-desc' });
      const chartDesc = el('p', { id: 'ct-payback-desc', class: 'sr-only', 'aria-live': 'polite', text: 'Calcule para ver la evolución del flujo acumulado y el punto de equilibrio.' });
      chartWrap.append(canvas, chartDesc);

      paybackCard.append(title, controls, mini, chartWrap);
      paybackCard._margen = margenGroup.input;
      paybackCard._tasa = tasaGroup.input;
      paybackCard._kpi = { inv: pbInv.value, vol: pbVol.value, margen: pbMargen.value, margenLabel: pbMargen.labelEl, roi: pbRoi.value };
      paybackCard._canvas = canvas;
      paybackCard._chartDesc = chartDesc;
      paybackCard._chart = createChartManager(canvas, getDisplay);

      const onPbChange = debounce(() => recomputePayback(), 350);
      [margenGroup.input, tasaGroup.input].forEach((inp) => inp.addEventListener('input', onPbChange));
      [margenGroup.minus, margenGroup.plus, tasaGroup.minus, tasaGroup.plus].forEach((btn) => btn.addEventListener('click', onPbChange));
    }

    function miniKpi(label) {
      const value = el('div', { class: 'ct-tco-mini-value', text: '—' });
      const card = el('div', { class: 'ct-tco-mini-kpi' }, [el('div', { class: 'ct-tco-mini-label', text: label }), value]);
      return { card, value };
    }

    function inputGroup(label, id, def, step, min, max) {
      const input = el('input', { id, type: 'text', class: 'ct-tco-control ct-campo-decimal', inputmode: 'decimal', value: def, 'aria-label': label });
      const minus = el('button', { type: 'button', class: 'ct-tco-btn ct-tco-btn-icon', 'aria-label': 'Disminuir ' + label, text: '−' });
      const plus = el('button', { type: 'button', class: 'ct-tco-btn ct-tco-btn-icon', 'aria-label': 'Aumentar ' + label, text: '+' });
      const stepNum = parseFloat(String(step).replace(',', '.')) || 0.5;
      minus.addEventListener('click', () => { adjust(input, -stepNum, min, max); });
      plus.addEventListener('click', () => { adjust(input, stepNum, min, max); });
      const wrap = el('div', { class: 'ct-tco-payback-field' }, [
        el('label', { for: id, class: 'ct-tco-label', text: label }),
        el('div', { class: 'ct-tco-input-group input-group' }, [minus, input, plus])
      ]);
      return { wrap, input, minus, plus };
    }

    function adjust(input, delta, min, max) {
      let v = 0;
      try { v = FormatoEs.parseDecimalEs(input.value || '0'); } catch (e) { v = 0; }
      v = Math.round((v + delta) * 100) / 100;
      if (min !== undefined) v = Math.max(Number(min), v);
      if (max !== undefined) v = Math.min(Number(max), v);
      input.value = String(v).replace('.', ',');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Populate & bind
    function populateCascades() {
      const eq = store.getEquipoActivo();
      if (!eq) return;
      state.equipoId = eq.id;
      fillSelect(selVariante, (eq.variantes || []).map((v, i) => ({ value: i, label: v.modelo || ('Variante ' + (i + 1)) })), state.varianteIndex);
      fillSelect(selModo, (eq.modos || []).map((m, i) => ({ value: i, label: m.nombre || ('Modo ' + (i + 1)) })), state.modoIndex);
      fillSelect(selPapel, (eq.papeles || []).map((p, i) => {
        const nombre = p.nombre || ('Papel ' + (i + 1));
        const cat = p.categoria ? ' · ' + p.categoria : '';
        const area = (Number(p.ancho) || 0) * (Number(p.longitud) || 0);
        const costM2 = area > 0 ? (Number(p.costo) || 0) / area : null;
        const costLabel = costM2 != null ? ' — $' + costM2.toFixed(2) + '/m²' : '';
        return { value: i, label: nombre + cat + costLabel };
      }), state.papelIndex);
      updateKpisForEquipo(eq);
    }

    function fillSelect(select, items, selectedIndex) {
      clear(select);
      if (!items || items.length === 0) {
        select.appendChild(el('option', { value: '0', text: '—' }));
        select.disabled = true;
        return;
      }
      select.disabled = false;
      items.forEach((it) => select.appendChild(el('option', { value: String(it.value), text: it.label })));
      const idx = Math.min(Math.max(Number(selectedIndex) || 0, 0), items.length - 1);
      select.value = String(idx);
    }

    function readDecimal(input, fallbackMsg) {
      const raw = (input.value || '').trim();
      if (raw === '' && fallbackMsg) throw new ValidationError(fallbackMsg);
      if (raw === '') return 0;
      if (!FormatoEs.esDecimalValido(raw)) throw new ValidationError(fallbackMsg || 'Formato numérico inválido');
      return FormatoEs.parseDecimalEs(raw);
    }

    function collectParams() {
      const eq = store.getEquipoActivo();
      if (!eq) throw new ValidationError('Seleccione un equipo');
      const variante = (eq.variantes || [])[Number(selVariante.value) || 0] || (eq.variantes || [])[0] || {};
      const modo = (eq.modos || [])[Number(selModo.value) || 0] || (eq.modos || [])[0] || {};
      const papel = (eq.papeles || [])[Number(selPapel.value) || 0] || null;
      const g = catalogo().globales || {};

      const metrosMes = readDecimal(inpMetros, 'Metros/mes debe ser mayor a 0');
      const horasDia = inpHoras.value.trim() === '' ? num(g.horas_dia_default, 4) : readDecimal(inpHoras, 'Horas/día inválidas');

      state.varianteIndex = Number(selVariante.value) || 0;
      state.modoIndex = Number(selModo.value) || 0;
      state.papelIndex = Number(selPapel.value) || 0;
      state.metrosMes = metrosMes;
      state.horasDia = horasDia;

      const dto = num(variante.dto_tinta_pct);
      const tintas = (eq.tintas || []).map((t) => ({ color_code: t.color_code, volumen_ml: num(t.volumen_ml), pvp: num(t.pvp) }));
      // El costo de tinta se calcula con el valor por ml más alto del equipo.
      const precioTintaMl = TintaService.costoMlMaximo(tintas, num(variante.precio_tinta), 0, dto);
      // derive legacy precio_tinta/volumen_tinta for calculator from first valid tinta
      let precioTinta = num(variante.precio_tinta);
      let volumenTinta = 0;
      const firstT = tintas.find((t) => t.volumen_ml > 0);
      if (firstT) { volumenTinta = firstT.volumen_ml; precioTinta = firstT.pvp; }
      if (volumenTinta <= 0 && num(variante.precio_tinta_ml) > 0) { volumenTinta = 1; precioTinta = num(variante.precio_tinta_ml); }
      // ensure >0 for validation when tintas exist
      if (volumenTinta <= 0) volumenTinta = 1;

      const params = {
        metros_mes: metrosMes,
        pct_desperdicio: eq.pct_desperdicio != null ? num(eq.pct_desperdicio) : num(g.pct_desperdicio),
        desperdicio_sustrato_pct: papel ? num(papel.desperdicio_pct) : 0,
        volumen_tinta: volumenTinta,
        consumo_ml_m2: getConsumoEfectivo(eq),
        velocidad_m2h: num(modo.velocidad_m2h),
        precio_tinta: precioTinta,
        horas_dia: horasDia,
        costo_kwh: num(g.costo_kwh, 0.23),
        power_print: num(eq.power_print),
        power_stby: num(eq.power_stby),
        valor_rollo: papel ? num(papel.costo) : 0,
        ancho_papel: papel ? num(papel.ancho) : 1,
        longitud_papel: papel ? num(papel.longitud) : 1,
        consumibles: eq.consumibles || [],
        valor_cabezal: num(eq.pvp_cabezal),
        num_cabezales: num(eq.num_cabezales),
        tiempo_cambio_meses: num(g.tiempo_cambio_meses, num(eq.vida_util_meses)),
        tintas: tintas,
        dto_tinta_pct: dto,
        otro_factor: 0,
        valor_equipo: num(variante.pvp_equipo != null ? variante.pvp_equipo : eq.pvp_equipo),
        meses_depreciacion: num(g.meses_depreciacion, 60),
        costo_mo_mensual: num(g.costo_mo_mensual),
        arrendamiento_mensual: num(g.arrendamiento_mensual),
        pvp_coverplus: num(eq.pvp_coverplus),
        precio_tinta_ml: precioTintaMl
      };

      return { params, eq, variante, modo, papel, g };
    }

    function showError(message) {
      clear(resultados);
      const alert = el('div', { class: 'ct-tco-alert ct-tco-alert-danger alert alert-danger', role: 'alert' });
      alert.textContent = message;
      resultados.appendChild(alert);
      paybackCard.classList.add('d-none');
      btnGuardar.style.display = 'none';
      state.resultados = null; state.payback = null;
      dispatch('tco:reset', {});
      if (host.onError) host.onError({ codigo: 422, mensaje: message });
    }

    function renderResultados(data, ctx) {
      clear(resultados);
      const eq = ctx.eq; const isDtg = eq.tipo === 'DTG';
      const unidad = isDtg ? 'Und' : 'm²';
      const cur = currencyCode();

      // Desglose table
      const table = el('table', { class: 'ct-tco-table table table-sm table-hover align-middle', id: 'ct-tabla-desglose' });
      const thead = el('thead', {}, [el('tr', {}, [el('th', { scope: 'col', text: 'Concepto' }), el('th', { scope: 'col', text: cur + '/' + unidad }), el('th', { scope: 'col', text: '%' })])]);
      const tbody = el('tbody');
      const total = num(data.tco_total_m2) || 1;
      function row(label, valueUsd, cls) {
        const pct = (num(valueUsd) / total) * 100;
        const tr = el('tr', { class: cls || '' }, [
          el('td', { text: label }),
          el('td', { text: fmtUnit2(valueUsd) }),
          el('td', { text: FormatoEs.fmtEs(pct, 1) + '%' })
        ]);
        tbody.appendChild(tr);
      }
      function section(label) { tbody.appendChild(el('tr', { class: 'ct-tco-section-row' }, [el('td', { colspan: '3', text: label })])); }

      section('Costos Variables (CVU)');
      row('Tinta', data.detalle.tinta_m2);
      row('Energía', data.detalle.energia_m2);
      row('Sustrato', data.detalle.sustrato_m2);
      row('Desperdicio sustrato', data.detalle.sustrato_desperdicio_m2);
      row('Consumibles', data.detalle.consumibles_m2);
      row('Cabezal', data.detalle.cabezal_m2);
      row('Desperdicio tinta', data.detalle.desperdicio_tinta_m2);
      row('Otro factor', data.detalle.otro_factor_m2);
      row('Subtotal CVU', data.cvu_m2, 'ct-tco-subtotal');

      section('Costos Fijos (CFU)');
      row('Mano de obra', data.costos_fijos_mensual.mano_obra / ctx.params.metros_mes);
      row('Arrendamiento', data.costos_fijos_mensual.arrendamiento / ctx.params.metros_mes);
      row('Depreciación', data.costos_fijos_mensual.depreciacion / ctx.params.metros_mes);
      row('CoverPlus', data.costos_fijos_mensual.coverplus / ctx.params.metros_mes);
      row('Subtotal CFU', data.costo_fijo_unitario, 'ct-tco-subtotal');

      tbody.appendChild(el('tr', { class: 'ct-tco-total table-primary fw-bold' }, [
        el('td', { text: 'Costo Total Unitario (TCO)' }),
        el('td', { text: fmtUnit2(data.tco_total_m2) }),
        el('td', { text: '100,0%' })
      ]));

      table.append(thead, tbody);
      const tableWrap = el('div', { class: 'table-responsive ct-tco-table-wrap', role: 'region', 'aria-label': 'Desglose de costos', tabindex: '0' }, [table]);
      const card = el('div', { class: 'ct-tco-card' }, [el('h3', { class: 'ct-tco-card-title', text: 'Desglose de costos (' + cur + '/' + unidad + ')' }), tableWrap]);
      resultados.appendChild(card);

      // Consumo tinta card if custom usage exists
      if (usoTotal() > 0) {
        const consumoCard = renderConsumoTinta(eq, ctx.params);
        if (consumoCard) resultados.appendChild(consumoCard);
      }

      btnGuardar.style.display = '';
    }

    function getEquipoCapacityMl(eq) {
      if (!eq) return 0;
      // 1) eq.inks
      const inks = Array.isArray(eq.inks) ? eq.inks : [];
      const firstInk = inks.find((i) => Number(i && i.capacity_ml) > 0);
      if (firstInk && Number(firstInk.capacity_ml) > 0) return Number(firstInk.capacity_ml);

      // 2) eq.tintas
      const tintas = Array.isArray(eq.tintas) ? eq.tintas : [];
      const firstTinta = tintas.find((t) => Number(t && t.volumen_ml) > 0);
      if (firstTinta && Number(firstTinta.volumen_ml) > 0) return Number(firstTinta.volumen_ml);

      // 3) parse de tag de eq.ink_skus (ej. '140ml', '350ml')
      const groups = Array.isArray(eq.ink_skus) ? eq.ink_skus : [];
      for (const g of groups) {
        const m = String(g && (g.tag || g.id) || '').match(/(\d+)/);
        if (m && Number(m[1]) > 0) return Number(m[1]);
      }
      return 0;
    }

    function renderConsumoTinta(eq, params) {
      const unit = unidadConsumo(eq);
      const isDtg = eq.tipo === 'DTG';
      const metrosMes = num(params.metros_mes);
      const capacityMl = getEquipoCapacityMl(eq);
      const rows = [];
      getEquipoColors(eq).forEach((code) => {
        const uso = num(state.usoTintaPorColor && state.usoTintaPorColor[code]);
        if (!(uso > 0)) return;
        const rendimientoUnidad = (capacityMl > 0 && uso > 0) ? (capacityMl / uso) : ((uso > 0) ? (1 / uso) : 0);
        const litrosMes = (uso * metrosMes) / 1000;
        rows.push({ tinta: code, consumo: uso, rendimiento: rendimientoUnidad, litrosMes, unidad: isDtg ? 'Und' : 'm²' });
      });
      if (!rows.length) return null;

      const table = el('table', { class: 'ct-tco-table table table-sm align-middle' });
      const unitLabel = isDtg ? 'Und' : 'm²';
      const rendimientoColLabel = capacityMl > 0
        ? ('Rendimiento (' + unitLabel + '/' + (capacityMl >= 1000 ? (capacityMl / 1000) + 'L' : capacityMl + 'ml') + ')')
        : ('Rendimiento (' + unitLabel + '/ml)');

      table.appendChild(el('thead', {}, [el('tr', {}, [
        el('th', { scope: 'col', text: 'Tinta' }),
        el('th', { scope: 'col', text: 'Consumo (' + unit + ')' }),
        el('th', { scope: 'col', text: rendimientoColLabel }),
        el('th', { scope: 'col', text: 'Estimado (L/mes)' })
      ])]));
      const tbody = el('tbody');
      rows.forEach((r) => {
        tbody.appendChild(el('tr', {}, [
          el('td', { text: r.tinta }),
          el('td', { text: FormatoEs.fmtEs(r.consumo, 2) }),
          el('td', { text: r.rendimiento ? FormatoEs.fmtEs(r.rendimiento, 2) : '—' }),
          el('td', { text: FormatoEs.fmtEs(r.litrosMes, 2) })
        ]));
      });
      table.appendChild(tbody);
      const wrap = el('div', { class: 'table-responsive ct-tco-table-wrap', role: 'region', 'aria-label': 'Consumo mensual de tinta', tabindex: '0' }, [table]);
      return el('div', { class: 'ct-tco-card', id: 'ct-card-consumo-tinta' }, [el('h3', { class: 'ct-tco-card-title', text: 'Consumo mensual de tinta' }), wrap]);
    }

    function recomputePayback() {
      if (!state.resultados || !state.contexto) return;
      let margenPct = 30, tasa = 6.5;
      try { margenPct = FormatoEs.parseDecimalEs(paybackCard._margen.value || '30'); } catch (e) {}
      try { tasa = FormatoEs.parseDecimalEs(paybackCard._tasa.value || '6,5'); } catch (e) {}
      const params = state.contexto.params;
      const g = state.contexto.g;
      const data = state.resultados;
      const pb = PaybackService.calcularPayback({
        inversion: num(params.valor_equipo),
        tco_total_m2: num(data.tco_total_m2),
        cvu_m2: num(data.cvu_m2),
        metros_mes: num(params.metros_mes),
        costos_fijos_mensual: num(data.costos_fijos_mensual.total),
        margen_pct: margenPct,
        tasa_anual_pct: tasa,
        meses_depreciacion: num(g.meses_depreciacion, 60)
      });
      state.payback = pb;
      updatePaybackUI(pb);
      dispatch('tco:payback-calculado', { data: pb });
      if (host.onPaybackCalculado) host.onPaybackCalculado({ data: pb });
    }

    function updatePaybackUI(pb) {
      paybackCard.classList.remove('d-none');
      const k = paybackCard._kpi;
      const cur = currencyCode();
      if (k.margenLabel) k.margenLabel.textContent = 'Margen mensual (' + cur + ')';
      k.inv.textContent = fmtMoney(pb.inversion_inicial, 2, 0);
      k.vol.textContent = FormatoEs.fmtEs(pb.volumen_mensual, 0);
      k.margen.textContent = fmtMoney(pb.margen_mensual, 2, 0);
      let roi = '—';
      if (pb.payback_descontado != null) roi = Math.ceil(pb.payback_descontado) + ' meses';
      else if (pb.payback_descontado_estado) roi = pb.payback_descontado_estado;
      k.roi.textContent = roi;
      if (paybackCard._chart) paybackCard._chart.render(pb);
      if (paybackCard._chartDesc) {
        const inv = fmtMoney(pb.inversion_inicial, 2, 0);
        const margen = fmtMoney(pb.margen_mensual, 2, 0);
        let eqText = 'sin punto de equilibrio en el horizonte evaluado';
        if (pb.payback_descontado != null) eqText = 'punto de equilibrio descontado estimado en ' + FormatoEs.fmtEs(pb.payback_descontado, 1) + ' meses';
        else if (pb.payback_descontado_estado) eqText = String(pb.payback_descontado_estado).toLowerCase();
        paybackCard._chartDesc.textContent = 'Inversión inicial ' + inv + '. Margen mensual ' + margen + '. ' + eqText + '.';
      }
    }

    function doCalcular() {
      try {
        const ctx = collectParams();
        const data = TCOCalculator.calcularTCO(ctx.params);
        state.resultados = data;
        state.contexto = ctx;
        state.ultimoPayload = { params: ctx.params, data };
        updateKpisForEquipo(ctx.eq);
        renderResultados(data, ctx);
        recomputePayback();
        const evento = { payload: state.ultimoPayload, data, contexto: ctx };
        dispatch('tco:calculado', evento);
        if (host.onCalculado) host.onCalculado(evento);
      } catch (e) {
        const msg = (e && e.message) ? e.message : 'Error de validación';
        showError(msg);
      }
    }

    function dispatch(name, detail) {
      try { container.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); } catch (e) {}
    }

    // Events
    form.addEventListener('submit', (e) => { e.preventDefault(); doCalcular(); });
    selVariante.addEventListener('change', () => { state.varianteIndex = Number(selVariante.value) || 0; updateKpisForEquipo(store.getEquipoActivo()); });
    selModo.addEventListener('change', () => { state.modoIndex = Number(selModo.value) || 0; updateKpisForEquipo(store.getEquipoActivo()); });
    selPapel.addEventListener('change', () => { state.papelIndex = Number(selPapel.value) || 0; });

    btnGuardar.addEventListener('click', () => {
      const detalle = { parametros: state.contexto ? state.contexto.params : null, resultados: state.resultados, payback: state.payback };
      dispatch('tco:guardar-solicitado', detalle);
      if (host.onGuardarEscenario) host.onGuardarEscenario(detalle);
    });

    function resolveVariantIndex(eq, variantId) {
      if (!eq || !Array.isArray(eq.variantes) || variantId == null) return -1;
      const needle = String(variantId);
      return eq.variantes.findIndex((v) => String(v.variant_id != null ? v.variant_id : v.id) === needle);
    }

    function init(initialId, initialVariantId) {
      const cat = catalogo();
      state.metrosMes = num(cat.globales.metros_mes_default, 1200);
      state.horasDia = num(cat.globales.horas_dia_default, 4);
      inpMetros.value = String(state.metrosMes).replace('.', ',');
      inpHoras.value = String(state.horasDia).replace('.', ',');

      // El simulador trabaja con el equipo que se está revisando; no hay selector de equipo.
      const eq = store.getEquipoById(initialId)
        || (cat.equipos || [])[0]
        || (cat.equiposOtras || [])[0];
      if (eq) store.seleccionarEquipo(eq.id);

      if (initialVariantId != null) {
        const active = store.getEquipoActivo();
        const idx = resolveVariantIndex(active, initialVariantId);
        if (idx >= 0) state.varianteIndex = idx;
      }
      populateCascades();
    }

    function refreshDisplay() {
      updateKpisForEquipo(store.getEquipoActivo());
      if (state.resultados && state.contexto) {
        renderResultados(state.resultados, state.contexto);
        if (state.payback) updatePaybackUI(state.payback);
      } else if (state.payback) {
        updatePaybackUI(state.payback);
      }
    }

    function setDisplay(nextDisplay) {
      displayState = normalizeDisplay(nextDisplay);
      refreshDisplay();
    }

    function destroy() {
      if (paybackCard._chart) {
        try { paybackCard._chart.destroy(); } catch (e) {}
      }
      // El overlay vive en <body>: hay que retirarlo explícitamente al destruir la vista.
      if (modal && modal.overlay && modal.overlay.parentNode) {
        modal.overlay.hidden = true;
        modal.overlay.parentNode.removeChild(modal.overlay);
      }
      unlockBackground(false);
      container.innerHTML = '';
      container.classList.remove('ct-tco');
    }

    return { init, destroy, recomputePayback, doCalcular, populateCascades, setDisplay };
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.createUI = createUI;
})(window);
