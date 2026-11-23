const colors = {
  C: { name: 'Cyan', hex: '#00FFFF' },
  M: { name: 'Magenta', hex: '#FF00FF' },
  Y: { name: 'Yellow', hex: '#FFFF00' },
  K: { name: 'Black', hex: '#000000' },
  HDK: { name: 'HD Black', hex: '#000000' },
  Wh: { name: 'White', hex: '#FFFFFF' },
  Lc: { name: 'Light Cyan', hex: '#E0FFFF' },
  Lm: { name: 'Light Magenta', hex: '#FFB6C1' },
  Vr: { name: 'Varnish', hex: '#fcfcb3' },
  Fy: { name: 'Fluorescent Yellow', hex: '#CCFF00' },
  Fp: { name: 'Fluorescent Pink', hex: '#FF1493' },
  Mk: { name: 'Matte Black', hex: '#1A1A1A' },
  Pk: { name: 'Photo Black', hex: '#0B0B0B' },
  R: { name: 'Red', hex: '#FF0000' },
  Gy: { name: 'Gray', hex: '#808080' },
  Gr: { name: 'Green', hex: '#008000' },
  Or: { name: 'Orange', hex: '#FFA500' },
  Vm: { name: 'Vivid Magenta', hex: '#FF007F' },
  Vlm: { name: 'Vivid Light Magenta', hex: '#FF66B2' },
  Lgy: { name: 'Light Gray', hex: '#D3D3D3' },
  V: { name: 'Violet', hex: '#8F00FF' },
  Op: { name: 'Optimizer', hex: '#f0f7f7' }
};

// Exposición explícita para scripts que corren en otro ámbito (p. ej. app.js).
window.PRICELIST_COLORS = colors;
