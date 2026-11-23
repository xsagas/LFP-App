(function (global) {
  'use strict';

  function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (def || 0);
  }

  function calcularPayback(input) {
    const p = input || {};
    const inversion = num(p.inversion);
    const tco = num(p.tco_total_m2);
    const cvu = num(p.cvu_m2);
    const metrosMes = num(p.metros_mes);
    const costosFijosMensual = num(p.costos_fijos_mensual);
    const margenPct = num(p.margen_pct);
    const tasaAnualPct = num(p.tasa_anual_pct);
    const horizonte = Math.max(1, Math.ceil(num(p.meses_depreciacion, 60)));

    const margen = margenPct / 100;
    let precioVentaM2 = 0;
    if (margen < 1) {
      precioVentaM2 = tco / (1 - margen);
    }
    const ingresoMensual = precioVentaM2 * metrosMes;
    const margenMensual = ingresoMensual - (cvu * metrosMes) - costosFijosMensual;

    const resultado = {
      inversion_inicial: inversion,
      precio_venta_m2: precioVentaM2,
      ingreso_mensual: ingresoMensual,
      margen_mensual: margenMensual,
      volumen_mensual: metrosMes,
      payback_simple: null,
      payback_descontado: null,
      payback_simple_estado: null,
      payback_descontado_estado: null,
      serie: { meses: [], simple: [], descontado: [] }
    };

    // Serie
    const r = tasaAnualPct / 12 / 100;
    let acumSimple = -inversion;
    let acumDesc = -inversion;
    for (let n = 0; n <= horizonte; n++) {
      resultado.serie.meses.push(n);
      if (n === 0) {
        resultado.serie.simple.push(acumSimple);
        resultado.serie.descontado.push(acumDesc);
      } else {
        acumSimple += margenMensual;
        acumDesc += margenMensual / Math.pow(1 + r, n);
        resultado.serie.simple.push(acumSimple);
        resultado.serie.descontado.push(acumDesc);
      }
    }

    function calc(tipo) {
      if (inversion <= 0) return { valor: 0.0, estado: 'Sin inversión' };
      if (margenMensual <= 0) return { valor: null, estado: 'Sin retorno' };

      let acumPrev = -inversion;
      for (let n = 1; n <= 720; n++) {
        const flujo = tipo === 'simple' ? margenMensual : (margenMensual / Math.pow(1 + r, n));
        const acum = acumPrev + flujo;
        if (acum >= 0) {
          const meses = (n - 1) + ((-acumPrev) / flujo);
          return { valor: meses, estado: 'ok' };
        }
        acumPrev = acum;
      }
      return { valor: null, estado: 'Mayor a 60 meses' };
    }

    const simple = calc('simple');
    const desc = calc('descontado');
    resultado.payback_simple = simple.valor;
    resultado.payback_simple_estado = simple.estado;
    resultado.payback_descontado = desc.valor;
    resultado.payback_descontado_estado = desc.estado;

    return resultado;
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.PaybackService = { calcularPayback };
})(window);
