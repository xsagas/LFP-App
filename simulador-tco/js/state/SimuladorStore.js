(function (global) {
  'use strict';

  function clone(obj) {
    return obj ? JSON.parse(JSON.stringify(obj)) : obj;
  }

  function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (def == null ? 0 : def);
  }

  function normalizeVariante(v, equipo) {
    const out = Object.assign({}, v || {});
    out.id = out.id != null ? out.id : 0;
    out.variant_id = out.variant_id != null ? String(out.variant_id) : String(out.id);
    out.orden = out.orden != null ? out.orden : 1;
    out.modelo = out.modelo || equipo.modelo || '';
    out.pvp_equipo = num(out.pvp_equipo != null ? out.pvp_equipo : equipo.pvp_equipo);
    out.dto_tinta_pct = num(out.dto_tinta_pct);
    if (out.precio_tinta == null) out.precio_tinta = 0;
    if (out.precio_tinta_ml == null) out.precio_tinta_ml = 0;
    return out;
  }

  function normalizeEquipo(e) {
    const eq = clone(e) || {};
    // Únicos defaults: unidades de medida. El resto viene de la definición del equipo.
    eq.tipo = eq.tipo || '';
    const isDtg = eq.tipo === 'DTG';
    eq.unidad = isDtg ? 'Und' : (eq.unidad || 'm²');
    eq.unidad_velocidad = isDtg ? 'Und/h' : (eq.unidad_velocidad || 'm²/h');
    eq.unidad_consumo = isDtg ? 'ml/Und' : (eq.unidad_consumo || 'ml/m²');
    eq.pvp_equipo = num(eq.pvp_equipo);
    eq.pct_desperdicio = num(eq.pct_desperdicio);
    eq.num_cabezales = num(eq.num_cabezales);
    eq.pvp_cabezal = num(eq.pvp_cabezal);
    eq.vida_util_meses = num(eq.vida_util_meses);
    eq.power_print = num(eq.power_print);
    eq.power_stby = num(eq.power_stby);
    eq.pvp_coverplus = num(eq.pvp_coverplus);
    eq.modos = Array.isArray(eq.modos) ? eq.modos.map((m, i) => Object.assign({ orden: i + 1 }, m)) : [];
    eq.papeles = Array.isArray(eq.papeles) ? eq.papeles : [];
    eq.tintas = Array.isArray(eq.tintas) ? eq.tintas : [];
    eq.consumibles = Array.isArray(eq.consumibles) ? eq.consumibles : [];

    let variantes = Array.isArray(eq.variantes) ? eq.variantes.slice() : [];
    if (variantes.length === 0) {
      variantes = [{
        id: 0,
        orden: 1,
        modelo: eq.modelo || 'Base',
        pvp_equipo: eq.pvp_equipo,
        dto_tinta_pct: 0,
        precio_tinta: 0,
        precio_tinta_ml: 0
      }];
    }
    eq.variantes = variantes.map((v) => normalizeVariante(v, eq));
    return eq;
  }

  function normalizeCatalogo(catalogo) {
    const c = clone(catalogo) || {};
    c.globales = Object.assign({
      costo_mo_mensual: 0,
      arrendamiento_mensual: 0,
      meses_depreciacion: 60,
      tiempo_cambio_meses: 36,
      costo_kwh: 0.23,
      pct_desperdicio: 1,
      metros_mes_default: 1200,
      horas_dia_default: 4
    }, c.globales || {});
    c.equipos = (Array.isArray(c.equipos) ? c.equipos : []).map(normalizeEquipo);
    c.equiposOtras = (Array.isArray(c.equiposOtras) ? c.equiposOtras : []).map((e) => normalizeEquipo(Object.assign({}, e, { otra_marca: true })));
    return c;
  }

  function createStore(initial) {
    let catalogo = normalizeCatalogo(initial || {});
    const state = {
      equipoId: null,
      varianteIndex: 0,
      modoIndex: 0,
      papelIndex: 0,
      metrosMes: num(catalogo.globales.metros_mes_default, 1200),
      horasDia: num(catalogo.globales.horas_dia_default, 4),
      agregarUsoTinta: false,
      usoTintaPorColor: {},
      resultados: null,
      payback: null,
      ultimoPayload: null,
      contexto: null
    };

    function todosEquipos() {
      return catalogo.equipos.concat(catalogo.equiposOtras);
    }

    function getEquipoById(id) {
      const sid = String(id);
      return todosEquipos().find((e) => String(e.id) === sid) || null;
    }

    function getEquipoActivo() {
      if (state.equipoId == null) return catalogo.equipos[0] || catalogo.equiposOtras[0] || null;
      return getEquipoById(state.equipoId) || catalogo.equipos[0] || catalogo.equiposOtras[0] || null;
    }

    function setCatalogo(nuevo) {
      catalogo = normalizeCatalogo(nuevo || {});
      if (state.equipoId != null && !getEquipoById(state.equipoId)) {
        state.equipoId = catalogo.equipos[0] ? catalogo.equipos[0].id : (catalogo.equiposOtras[0] ? catalogo.equiposOtras[0].id : null);
      }
      state.varianteIndex = 0;
      state.modoIndex = 0;
      state.papelIndex = 0;
      state.resultados = null;
      state.payback = null;
      state.ultimoPayload = null;
      state.contexto = null;
    }

    function seleccionarEquipo(id) {
      const eq = getEquipoById(id);
      if (!eq) return null;
      state.equipoId = eq.id;
      state.varianteIndex = 0;
      state.modoIndex = 0;
      state.papelIndex = 0;
      state.agregarUsoTinta = false;
      state.usoTintaPorColor = {};
      state.resultados = null;
      state.payback = null;
      return eq;
    }

    function getEstadoActual() {
      return clone({
        parametros: {
          equipoId: state.equipoId,
          varianteIndex: state.varianteIndex,
          modoIndex: state.modoIndex,
          papelIndex: state.papelIndex,
          metrosMes: state.metrosMes,
          horasDia: state.horasDia,
          agregarUsoTinta: state.agregarUsoTinta,
          usoTintaPorColor: state.usoTintaPorColor
        },
        resultados: state.resultados,
        payback: state.payback,
        contexto: state.contexto,
        ultimoPayload: state.ultimoPayload
      });
    }

    return {
      state,
      getCatalogo: () => catalogo,
      setCatalogo,
      todosEquipos,
      getEquipoById,
      getEquipoActivo,
      seleccionarEquipo,
      getEstadoActual
    };
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.createStore = createStore;
})(window);
