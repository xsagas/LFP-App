(function (global) {
  'use strict';

  const { ValidationError } = global.CTTCO;

  function num(v, def) {
    const n = Number(v);
    return Number.isFinite(n) ? n : (def || 0);
  }

  function calcularTCO(params) {
    const p = params || {};

    const metrosMes = num(p.metros_mes);
    const pctDesperdicio = num(p.pct_desperdicio);
    const despSust = num(p.desperdicio_sustrato_pct);
    const volumenTintaLegado = num(p.volumen_tinta);
    const consumoMlM2 = num(p.consumo_ml_m2);
    const metrosHora = num(p.velocidad_m2h);
    const precioTinta = num(p.precio_tinta);
    const volumenTinta = num(p.volumen_tinta);
    const rawPrecioTintaMl = p.precio_tinta_ml;
    const hasPrecioTintaMl = rawPrecioTintaMl != null && rawPrecioTintaMl !== ''
      && Number.isFinite(Number(rawPrecioTintaMl));
    const precioTintaMl = hasPrecioTintaMl ? Number(rawPrecioTintaMl) : 0;
    const horasDia = num(p.horas_dia);
    const costoKwh = num(p.costo_kwh);
    const powerPrint = num(p.power_print);
    const powerStby = num(p.power_stby);
    const valorRollo = num(p.valor_rollo);
    const anchoPapel = num(p.ancho_papel);
    const longitudPapel = num(p.longitud_papel);
    const consumibles = Array.isArray(p.consumibles) ? p.consumibles : [];
    const valorCabezal = num(p.valor_cabezal);
    const numCabezales = num(p.num_cabezales);
    const tiempoCambioMeses = num(p.tiempo_cambio_meses);
    const tintas = Array.isArray(p.tintas) ? p.tintas : [];
    const dtoPct = num(p.dto_tinta_pct);
    const factorDto = 1 - (dtoPct / 100);
    const otroFactor = num(p.otro_factor);
    const valorEquipo = num(p.valor_equipo);
    const mesesDepreciacion = num(p.meses_depreciacion);
    const costoMoMensual = num(p.costo_mo_mensual);
    const arrendamientoMensual = num(p.arrendamiento_mensual);
    const pvpCoverPlus = num(p.pvp_coverplus);

    if (metrosMes <= 0) throw new ValidationError('Metros/mes debe ser mayor a 0');
    if (pctDesperdicio < 0 || pctDesperdicio >= 100) throw new ValidationError('pct_desperdicio debe estar en [0,100)');
    if (despSust < 0 || despSust >= 100) throw new ValidationError('desperdicio_sustrato_pct debe estar en [0,100)');
    if (volumenTintaLegado <= 0) throw new ValidationError('Volumen de tinta debe ser mayor a 0');

    // 2. Costos Variables Unitarios (cvu_m2)
    // Tinta
    // Prioriza el costo/ml máximo efectivo calculado por la UI (incluye descuento de tinta).
    const costoTintaMl = hasPrecioTintaMl
      ? precioTintaMl
      : (volumenTinta > 0 ? (precioTinta / volumenTinta) : 0);
    const costoTintaM2 = consumoMlM2 * costoTintaMl;

    // Energía (base fija 720 h/mes; horas_dia no interviene en TCO)
    const horasImpresionMes = metrosHora > 0 ? (metrosMes / metrosHora) : 0;
    const horasStandbyMes = Math.max(720 - horasImpresionMes, 0);
    const costoEnergiaM2 = (((horasImpresionMes * powerPrint) + (horasStandbyMes * powerStby)) * costoKwh) / metrosMes;

    // Sustrato
    const areaRollo = anchoPapel * longitudPapel;
    const costoPapelM2 = areaRollo > 0 ? (valorRollo / areaRollo) : 0;
    const costoSustratoDespM2 = (despSust / 100) * costoPapelM2;

    // Consumibles mensual
    const costoConsumiblesMensual = consumibles.reduce((acc, c) => {
      const vida = num(c && c.vida_util_dias);
      if (vida <= 0) return acc;
      return acc + (((num(c.pvp) * num(c.cantidad, 1)) * 30) / vida);
    }, 0);

    // Cabezal mensual
    const costoCabezalMensual = tiempoCambioMeses > 0 ? ((valorCabezal * numCabezales) / tiempoCambioMeses) : 0;

    // Desperdicio de tinta mensual (literal)
    const sumaVolumenTintas = tintas.reduce((acc, t) => acc + num(t && t.volumen_ml), 0);
    let maxPrecioMlDto = 0;
    if (tintas.length > 0) {
      maxPrecioMlDto = tintas.reduce((mx, t) => {
        const vol = num(t && t.volumen_ml);
        if (vol <= 0) return mx;
        const pml = (num(t.pvp) * factorDto) / vol;
        return pml > mx ? pml : mx;
      }, 0);
    } else if (volumenTinta > 0) {
      maxPrecioMlDto = (precioTinta * factorDto) / volumenTinta;
    }
    const costoDesperdicioTintaMensual = sumaVolumenTintas * (pctDesperdicio / 100) * maxPrecioMlDto;

    // Nota literal: costos_variables_mensual.total suma únicamente consumibles + cabezal
    const costosVariablesMensual = {
      consumibles: costoConsumiblesMensual,
      cabezal: costoCabezalMensual,
      desperdicio_tinta: costoDesperdicioTintaMensual,
      total: costoConsumiblesMensual + costoCabezalMensual
    };

    const cvu_m2 = costoTintaM2 + costoEnergiaM2 + costoPapelM2 + costoSustratoDespM2
      + ((costoConsumiblesMensual + costoCabezalMensual + costoDesperdicioTintaMensual) / metrosMes)
      + otroFactor;

    // 3. Costos Fijos y TCO
    const depreciacionMensual = mesesDepreciacion > 0 ? (valorEquipo / mesesDepreciacion) : 0;
    const costoCoverPlusMensual = pvpCoverPlus / 12;
    const costosFijosMensual = costoMoMensual + arrendamientoMensual + depreciacionMensual + costoCoverPlusMensual;

    const costo_fijo_unitario = costosFijosMensual / metrosMes;
    const tco_total_m2 = cvu_m2 + costo_fijo_unitario;

    // contexto: costo diario usa horas_dia (no altera TCO)
    const diasMes = 30;
    const costoEnergiaMensual = (((horasImpresionMes * powerPrint) + (horasStandbyMes * powerStby)) * costoKwh);
    const costoEnergiaDiaAprox = costoEnergiaMensual / diasMes;
    const costoFijoDiaAprox = costosFijosMensual / diasMes;
    const costoVariableDiaAprox = cvu_m2 * (metrosHora * horasDia);
    const costo_diario_usd = costoFijoDiaAprox + costoEnergiaDiaAprox + costoVariableDiaAprox;

    return {
      cvu_m2,
      costo_fijo_unitario,
      tco_total_m2,
      detalle: {
        tinta_m2: costoTintaM2,
        energia_m2: costoEnergiaM2,
        sustrato_m2: costoPapelM2,
        sustrato_desperdicio_m2: costoSustratoDespM2,
        consumibles_m2: costoConsumiblesMensual / metrosMes,
        cabezal_m2: costoCabezalMensual / metrosMes,
        desperdicio_tinta_m2: costoDesperdicioTintaMensual / metrosMes,
        otro_factor_m2: otroFactor
      },
      costos_variables_mensual: costosVariablesMensual,
      costos_fijos_mensual: {
        mano_obra: costoMoMensual,
        arrendamiento: arrendamientoMensual,
        depreciacion: depreciacionMensual,
        coverplus: costoCoverPlusMensual,
        total: costosFijosMensual
      },
      contexto: {
        horas_impresion_mes: horasImpresionMes,
        horas_standby_mes: horasStandbyMes,
        costo_energia_mensual: costoEnergiaMensual,
        costo_diario_usd
      }
    };
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.TCOCalculator = { calcularTCO };
})(window);
