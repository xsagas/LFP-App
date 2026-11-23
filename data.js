'use strict';
// DATOS DE PRODUCTOS (modelo canónico)
// - base_price_usd: precio base del equipo en USD
// - variants: variantes/planes con id estable, precio y descuento de tinta
// - inks: tintas con id estable
// El normalizador (model.js) acepta también campos legacy por compatibilidad.

window.PRICELIST_MODELS = [
{
    id: 'surecolor-f570',
	category: 'Textile',
    name: 'SureColor F570',
	net_price_usd: 1730.97,
	"markup_%": 19.00,
    base_price_usd: 2137.00,
    fair_price_usd: 0,
	tco:'true', //true o false
    inks: [
      { id: 't49m-cmyk-140ml', name: 'T49M Dye-Sublimation', price_usd: 17.67, capacity_ml: 140 }
    ],
	inks_sku:[
	{id: '140', tag: '140ml', inks: [{SKU:'T49M220', color:'C'}, {SKU:'T49M320', color:'M'}, {SKU:'T49M420', color:'Y'}, {SKU:'T49M120', color:'K'}]}
	],
	accesories:[
	{id: 'mbox', label: 'Maintenance Box', price_usd: 48.00, SKU: 'C13S210057'},
	{id: 'pcut', label: 'Printer Cutter Blade', price_usd: 150.00, SKU: 'C13S210055'},
		],		
    notes: 'Incluye kit de tintas para inicialización.'
  },
  {
    id: 'surecolor-f6470',
	category: 'Textile',
    name: 'SureColor F6470',
	net_price_usd: 4263.00,
	"markup_%": 19.00,
    base_price_usd: 5263.00,
    fair_price_usd: 0,
	tco:'true',
    variants: [
      { id: 'warranty-1y', plan: 'FullClub 10%', label: '1 año garantía', price_usd: 5263.00, ink_discount_pct: 10, notes: 'No incluye tintas. 1 año de garantía. Descuento en tinta por 1 año.', is_default: true },
      { id: 'coverplus-3y', plan: 'FullClub 20%',  label: '1 año garantía + 2 años CoverPlus', price_usd: 6316.00, ink_discount_pct: 20, notes: 'No incluye tintas. 1 año de garantía + 2 años CoverPlus. Descuento en tinta por 3 años.' },
      { id: 'coverplus-5y', plan: 'FullClub 30%',  label: '1 año garantía + 4 años CoverPlus', price_usd: 6579.00, ink_discount_pct: 30, notes: 'No incluye tintas. 1 año de garantía + 4 años CoverPlus. Descuento en tinta por 5 años.' }
    ],
    inks: [
      { id: 't53k-cmyk-1600ml', name: 'T53K UltraChrome DS', price_usd: 124.93, capacity_ml: 1600 }
    ],
	inks_sku:[
	{id: '1600', tag: '1600ml', inks: [{SKU:'T53K220', color:'C'}, {SKU:'T53K320', color:'M'}, {SKU:'T53K420', color:'Y'}, {SKU:'T53K920', color:'HDK'}]}
	],
	accesories:[
	{id: 'hmkit', label: 'Head Maintenance Kit', price_usd: 50.00, SKU: 'C13S400145'},
	{id: 'mkit', label: 'Maintenance Kit', price_usd: 30.00, SKU: 'C13S210063'},
	{id: 'wkit', label: 'Wiper Kit', price_usd: 45.00, SKU: 'C13S210095'},
	{id: 'acut', label: 'Auto Cutter Blade', price_usd: 20.00, SKU: 'C13S902006'}
	],
    notes: 'No incluye tintas.'
  },
  {
    id: 'surecolor-S7170',
	category: 'Signage',
    name: 'SureColor S7170',
	net_price_usd: 4263.00,
	"markup_%": 19.00,
    base_price_usd: 5263.00,
    fair_price_usd: 0,
	tco:'true',
    variants: [
      { id: 'warranty-1y', plan: 'FullClub 10%',  label: '1 año garantía', price_usd: 5263.00, ink_discount_pct: 10, notes: 'No incluye tintas. 1 año de garantía. Descuento en tinta por 1 año.', is_default: true },
      { id: 'coverplus-3y', plan: 'FullClub 20%',  label: '1 año garantía + 2 años CoverPlus', price_usd: 6316.00, ink_discount_pct: 20, notes: 'No incluye tintas. 1 año de garantía + 2 años CoverPlus. Descuento en tinta por 3 años.' }
          ],
    inks: [
      { id: 't51n-cmyk-1500ml', name: 'T51N UltraChrome GS3', price_usd: 131.93, capacity_ml: 1500 }
    ],
	inks_sku:[
	{id: '1500', tag: '1500ml', inks: [{SKU:'T51N220', color:'C'}, {SKU:'T51N320', color:'M'}, {SKU:'T51N420', color:'Y'}, {SKU:'T51N120', color:'K'}]}
	],
	accesories:[
	{id: 'hmkit', label: 'Head Maintenance Kit', price_usd: 50.00, SKU: 'C13S400145'},
	{id: 'mkit', label: 'Maintenance Kit', price_usd: 30.00, SKU: 'C13S210063'},
	{id: 'wkit', label: 'Wiper Kit', price_usd: 45.00, SKU: 'C13S210095'},
	{id: 'acut', label: 'Auto Cutter Blade', price_usd: 20.00, SKU: 'C13S902006'}
	],
    notes: 'No incluye tintas.'
  },
  {
    id: 'surecolor-T5770',
	category: 'Photo/CAD',
    name: 'SureColor T5770DR',
	net_price_usd: 1730.97,
	"markup_%": 19.00,
    base_price_usd: 2137.00,
    fair_price_usd: 0,
	tco:'true',
    inks: [
      { id: 't50l-700ml', name: 'T50L UltraChrome XD3', price_usd: 317.67, capacity_ml: 700 },
	  { id: 't50S-350ml', name: 'T50S UltraChrome XD3', price_usd: 197.67, capacity_ml: 350 }
    ],
	inks_sku:[
	{id: '350', tag: '350ml', inks: [{SKU:'T50S220', color:'C'}, {SKU:'T50S320', color:'M'}, {SKU:'T50S420', color:'Y'}, {SKU:'T50S820', color:'Mk'}, {SKU:' T50S120', color:'Pk'}, {SKU:'T50SF20', color:'R'}]},
	{id: '700', tag: '700ml', inks: [{SKU:'T50L220', color:'C'}, {SKU:'T50L320', color:'M'}, {SKU:'T50L420', color:'Y'}, {SKU:'T50L820', color:'Mk'}, {SKU:' T50L120', color:'Pk'}, {SKU:'T50LF20', color:'R'}]}
	],
	accesories:[
	{id: 'mbox', label: 'Maintenance Box', price_usd: 48.00, SKU: 'C13S210057'},
	{id: 'pcut', label: 'Printer Cutter Blade', price_usd: 150.00, SKU: 'C13S210055'},
	
	],
    notes: 'Incluye kit de tintas para inicialización.'
  }
  
  ]