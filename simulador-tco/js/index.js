(function (global) {
  'use strict';

  const C = global.CTTCO;

  function mount(containerOrSelector, config) {
    const cfg = config || {};
    const container = typeof containerOrSelector === 'string'
      ? document.querySelector(containerOrSelector)
      : containerOrSelector;

    if (!container) {
      throw new Error('ChannelToolsTCO: contenedor no encontrado');
    }

    const store = C.createStore(cfg.catalogo || { globales: {}, equipos: [], equiposOtras: [] });
    const host = {
      onCalculado: cfg.onCalculado,
      onPaybackCalculado: cfg.onPaybackCalculado,
      onError: cfg.onError
    };

    const display = cfg.display || { currency: 'USD', trm: null };
    const ui = C.createUI(container, store, host, display);

    const initialId = cfg.equipoInicialId != null ? cfg.equipoInicialId : (cfg.escenarioPrecargado && cfg.escenarioPrecargado.equipoId);
    const initialVariantId = cfg.varianteInicialId != null ? cfg.varianteInicialId : (cfg.escenarioPrecargado && cfg.escenarioPrecargado.varianteId);
    ui.init(initialId, initialVariantId);

    if (cfg.escenarioPrecargado) {
      // best-effort preload could be extended; keep minimal for now
      try { /* placeholder for future scenario restore */ } catch (e) {}
    }

    const instance = {
      setCatalogo: function (nuevoCatalogo) {
        store.setCatalogo(nuevoCatalogo || {});
        ui.populateCascades();
      },
      seleccionarEquipo: function (equipoId) {
        const eq = store.seleccionarEquipo(equipoId);
        if (eq) {
          ui.populateCascades();
        }
        return eq;
      },
      getEstadoActual: function () {
        return store.getEstadoActual();
      },
      setDisplay: function (nextDisplay) {
        if (ui.setDisplay) ui.setDisplay(nextDisplay || {});
      },
      destroy: function () {
        ui.destroy();
      },
      _store: store
    };

    return instance;
  }

  global.ChannelToolsTCO = { mount };
})(window);
