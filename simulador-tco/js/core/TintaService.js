(function (global) {
  'use strict';

  function costoMlPromedio(tintas, legadoPvp, legadoVolumen, dtoPct) {
    const dto = Number(dtoPct) || 0;
    const factor = 1 - (dto / 100);
    const lista = Array.isArray(tintas) ? tintas : [];
    const validas = lista.filter((t) => Number(t && t.volumen_ml) > 0);

    if (validas.length > 0) {
      const costos = validas.map((t) => ((Number(t.pvp) || 0) * factor) / Number(t.volumen_ml));
      const suma = costos.reduce((a, b) => a + b, 0);
      return suma / costos.length;
    }

    const vol = Number(legadoVolumen);
    if (vol > 0) {
      return ((Number(legadoPvp) || 0) * factor) / vol;
    }
    return 0.0;
  }

  // Costo por ml más alto entre las tintas del equipo (con descuento aplicado).
  // Se usa para calcular el costo de tinta de forma conservadora.
  function costoMlMaximo(tintas, legadoPvp, legadoVolumen, dtoPct) {
    const dto = Number(dtoPct) || 0;
    const factor = 1 - (dto / 100);
    const lista = Array.isArray(tintas) ? tintas : [];
    let max = 0;

    lista.forEach((t) => {
      const vol = Number(t && t.volumen_ml);
      if (!(vol > 0)) return;
      const pml = ((Number(t.pvp) || 0) * factor) / vol;
      if (pml > max) max = pml;
    });

    if (max > 0) return max;

    const vol = Number(legadoVolumen);
    if (vol > 0) return ((Number(legadoPvp) || 0) * factor) / vol;
    return 0.0;
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.TintaService = { costoMlPromedio, costoMlMaximo };
})(window);
