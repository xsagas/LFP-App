(function (global) {
  'use strict';

  class ValidationError extends Error {
    constructor(message, codigo) {
      super(message);
      this.name = 'ValidationError';
      this.codigo = codigo || 422;
    }
  }

  function esDecimalValido(valor) {
    if (typeof valor === 'number') return Number.isFinite(valor);
    if (typeof valor !== 'string') return false;
    return /^\d+(,\d{1,2})?$/.test(valor);
  }

  function parseDecimalEs(valor) {
    if (typeof valor === 'number') {
      if (Number.isFinite(valor)) return valor;
      throw new ValidationError('Valor numérico inválido', 422);
    }
    if (typeof valor !== 'string') {
      throw new ValidationError('Formato numérico inválido', 422);
    }
    const sinMiles = valor.replace(/\./g, '');
    if (!/^\d+(,\d{1,2})?$/.test(sinMiles)) {
      throw new ValidationError('Formato numérico inválido. Use coma decimal (ej: 1200,50).', 422);
    }
    const n = Number(sinMiles.replace(',', '.'));
    if (!Number.isFinite(n)) {
      throw new ValidationError('Formato numérico inválido', 422);
    }
    return n;
  }

  function fmtEs(numero, decimales) {
    const d = typeof decimales === 'number' ? decimales : 2;
    const n = Number(numero);
    if (!Number.isFinite(n)) return '—';
    const fixed = Math.abs(n).toFixed(d);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const sign = n < 0 ? '-' : '';
    return sign + parts.join(',');
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.ValidationError = ValidationError;
  global.CTTCO.FormatoEs = { esDecimalValido, parseDecimalEs, fmtEs };
})(window);
