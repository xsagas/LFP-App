(function (global) {
  'use strict';

  const { FormatoEs } = global.CTTCO;

  function createChartManager(canvas, getDisplay) {
    let chart = null;

    function currentDisplay() {
      const d = (typeof getDisplay === 'function' ? getDisplay() : getDisplay) || {};
      const currency = d.currency === 'COP' ? 'COP' : 'USD';
      const trm = Number(d.trm);
      const activeTrm = (currency === 'COP' && Number.isFinite(trm) && trm > 0) ? trm : null;
      return { currency: activeTrm ? 'COP' : 'USD', trm: activeTrm };
    }

    function toDisplay(usdValue) {
      const d = currentDisplay();
      return d.currency === 'COP' ? (Number(usdValue) || 0) * d.trm : (Number(usdValue) || 0);
    }

    function fmtChartAxis(v) {
      const n = Number(v) || 0;
      const abs = Math.abs(n);
      const sign = n < 0 ? '-' : '';
      if (abs >= 1000000) {
        const m = abs / 1000000;
        const fixed = m.toFixed(abs % 1000000 === 0 ? 0 : 2);
        return sign + fixed.replace('.', ',') + 'M';
      }
      if (abs >= 1000) {
        const k = abs / 1000;
        const fixed = k.toFixed(abs % 1000 === 0 ? 0 : 2);
        return sign + fixed.replace('.', ',') + 'k';
      }
      return FormatoEs.fmtEs(n, 2).replace(/\./g, '');
    }

    function destroy() {
      if (chart) {
        chart.destroy();
        chart = null;
      }
    }

    function render(payback) {
      if (!canvas || typeof Chart === 'undefined') return;
      destroy();
      const d = currentDisplay();
      const serie = payback && payback.serie ? payback.serie : { meses: [], simple: [], descontado: [] };
      const labels = serie.meses || [];
      const dataDesc = (serie.descontado || []).map(toDisplay);
      const dataSimple = (serie.simple || []).map(toDisplay);
      const pb = payback ? payback.payback_descontado : null;

      const datasets = [
        {
          label: 'Payback Descontado',
          data: dataDesc,
          borderColor: '#03045e',
          backgroundColor: 'rgba(3,4,94,0.08)',
          fill: true,
          tension: 0.2,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointStyle: 'circle',
          pointBackgroundColor: '#03045e',
          pointBorderColor: '#03045e'
        },
        {
          label: 'Payback Simple',
          data: dataSimple,
          borderColor: '#737373',
          borderDash: [6, 4],
          fill: false,
          tension: 0.2,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointStyle: 'circle',
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#737373'
        }
      ];

      const ctx = canvas.getContext('2d');
      const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: reduceMotion ? false : undefined,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  const v = context.parsed.y != null ? context.parsed.y : (context.raw && context.raw.y);
                  const val = Number.isFinite(v) ? fmtChartAxis(v) : '—';
                  return (context.dataset.label || '') + ': ' + val;
                }
              }
            }
          },
          scales: {
            x: {
              title: { display: true, text: 'Meses' }
            },
            y: {
              title: { display: true, text: d.currency === 'COP' ? 'Cop' : 'Usd' },
              grid: {
                color: function (ctx2) {
                  return ctx2.tick && ctx2.tick.value === 0 ? 'rgba(10,10,10,0.5)' : 'rgba(229,229,229,0.8)';
                }
              },
              ticks: {
                callback: function (value) {
                  return fmtChartAxis(value);
                }
              }
            }
          }
        }
      });
    }

    return { render, destroy };
  }

  global.CTTCO = global.CTTCO || {};
  global.CTTCO.createChartManager = createChartManager;
})(window);
