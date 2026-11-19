/**
 * Arquivos do gerador 3D (`@avilaops/gerador-3d`): spec de cada equipamento,
 * planta em SVG e silhueta em planta. Lidos no build, das linhas Premium
 * (`ludus`) e Core (`ludus-core`); os códigos não se repetem entre elas.
 */
const RAIZ = '/node_modules/@avilaops/gerador-3d/catalogs';

const specModules = import.meta.glob<Record<string, unknown>>(
  '/node_modules/@avilaops/gerador-3d/catalogs/{ludus,ludus-core}/specs/*.json',
  { eager: true, import: 'default' }
);
const plantaModules = import.meta.glob<string>(
  '/node_modules/@avilaops/gerador-3d/catalogs/{ludus,ludus-core}/models/*/plan.svg',
  { eager: true, query: '?raw', import: 'default' }
);
const silhuetaModules = import.meta.glob<Silhueta>(
  '/node_modules/@avilaops/gerador-3d/catalogs/{ludus,ludus-core}/models/*/footprint.json',
  { eager: true, import: 'default' }
);

/** Indexa os arquivos pelo código do equipamento, qualquer que seja o catálogo. */
function porCodigo<T>(modulos: Record<string, T>, padrao: RegExp): Map<string, T> {
  const mapa = new Map<string, T>();
  for (const [caminho, valor] of Object.entries(modulos)) {
    const codigo = caminho.slice(RAIZ.length).match(padrao)?.[1];
    if (codigo) mapa.set(codigo, valor);
  }
  return mapa;
}
const specs = porCodigo(specModules, /^\/[^/]+\/specs\/([^/]+)\.json$/);
const plantas = porCodigo(plantaModules, /^\/[^/]+\/models\/([^/]+)\/plan\.svg$/);
const silhuetas = porCodigo(silhuetaModules, /^\/[^/]+\/models\/([^/]+)\/footprint\.json$/);

export interface Silhueta {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  outline: [number, number][];
  parts: [number, number][][];
}

export const spec = (code: string) => specs.get(code);
export const planta = (code: string) => plantas.get(code);
export const silhueta = (code: string) => silhuetas.get(code);

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
