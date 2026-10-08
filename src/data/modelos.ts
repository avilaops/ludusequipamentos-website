/**
 * Arquivos do gerador 3D (`@avilaops/gerador-3d`): spec de cada equipamento,
 * planta em SVG e silhueta em planta. Lidos no build.
 */
const BASE = '/node_modules/@avilaops/gerador-3d/catalogs/ludus';

const specModules = import.meta.glob<Record<string, unknown>>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/specs/*.json',
  { eager: true, import: 'default' }
);
const plantaModules = import.meta.glob<string>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/models/*/plan.svg',
  { eager: true, query: '?raw', import: 'default' }
);
const silhuetaModules = import.meta.glob<Silhueta>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/models/*/footprint.json',
  { eager: true, import: 'default' }
);

export interface Silhueta {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  outline: [number, number][];
  parts: [number, number][][];
}

export const spec = (code: string) => specModules[`${BASE}/specs/${code}.json`];
export const planta = (code: string) => plantaModules[`${BASE}/models/${code}/plan.svg`];
export const silhueta = (code: string) => silhuetaModules[`${BASE}/models/${code}/footprint.json`];

/** Polígonos da silhueta já girados (quartos de volta) e postos em (x, y). Frente do equipamento para baixo com rot = 0. */
export function poligonos(code: string, x: number, y: number, rot: number): string {
  const s = silhueta(code);
  if (!s) return '';
  const r = ((rot % 4) + 4) % 4;
  const gira = ([px, pz]: [number, number]): [number, number] =>
    r === 0 ? [px, pz] : r === 1 ? [-pz, px] : r === 2 ? [-px, -pz] : [pz, -px];
  return s.parts
    .map((part) => {
      const pts = part.map((p) => gira(p)).map(([a, b]) => `${(x + a).toFixed(3)},${(y + b).toFixed(3)}`);
      return `<polygon points="${pts.join(' ')}"/>`;
    })
    .join('');
}
