import produtosJson from './produtos.json';

export interface Produto {
  code: string;
  slug: string;
  nome: string;
  linha: string;
  grupo_muscular: string;
  /** [C, L, A] em mm. */
  dim: [number, number, number];
  peso: string | null;
  bateria: string | null;
  descricao: string;
}

export const produtos = produtosJson as Produto[];
export const porCodigo = new Map(produtos.map((p) => [p.code, p]));

/** Dados da empresa. O que ainda não foi informado pela Ludus fica como `null` e aparece como "a confirmar". */
export const empresa = {
  nome: 'Ludus Equipamentos',
  marca: 'Ludus Premium',
  whatsapp: '(17) 99777-5154',
  whatsappNumero: '5517997775154',
  email: 'comercial@ludusequipamentos.com.br',
  cnpj: null as string | null,
  endereco: null as string | null,
  garantia: null as string | null,
  prazoEntrega: null as string | null,
  pagamento: null as string | null,
};

export function whatsapp(mensagem: string): string {
  return `https://wa.me/${empresa.whatsappNumero}?text=${encodeURIComponent(mensagem)}`;
}

export const linhas = [
  {
    id: 'Peso livre',
    slug: 'peso-livre',
    titulo: 'Peso Livre Articulado',
    resumo:
      'Carga por anilhas e braços independentes. Cada lado do corpo trabalha sozinho e a progressão não para no limite de uma bateria.',
    destaque: 'LD-A030',
  },
  {
    id: 'Bateria de pesos',
    slug: 'bateria-de-pesos',
    titulo: 'Bateria de Pesos',
    resumo:
      'Troca de carga com um pino, movimento guiado e ajuste rápido. A base de qualquer sala de musculação, do iniciante ao avançado.',
    destaque: 'LD-B004',
  },
  {
    id: 'Bancos e suportes',
    slug: 'bancos-e-suportes',
    titulo: 'Bancos e Suportes',
    resumo:
      'Bancos retos, inclinados e reguláveis, supinos com suporte de barra e a organização de barras e anilhas da área de peso livre.',
    destaque: 'LD-A050',
  },
] as const;

export const grupos = [...new Set(produtos.map((p) => p.grupo_muscular))];

/** Folga de uso e circulação em volta de cada equipamento (m). */
export const FOLGA = 0.6;

export function areaTreino(p: Produto): number {
  return (p.dim[0] / 1000 + 2 * FOLGA) * (p.dim[1] / 1000 + 2 * FOLGA);
}

export const fmt = (n: number, d = 1) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** Opções de cor do catálogo (disponibilidade a confirmar com a Ludus). */
export const coresEstrutura = [
  ['Piano Black', '#121212'],
  ['Graphite Black', '#3a3b3d'],
  ['Light Grey', '#c8cacc'],
  ['Titanium Grey', '#5e6367'],
  ['Performance Red', '#b8242a'],
] as const;
export const coresBraco = [
  ['Preto', '#121212'],
  ['Grafite', '#3a3b3d'],
  ['Cinza', '#c8cacc'],
  ['Vermelho', '#b8242a'],
  ['Laranja', '#e2702a'],
  ['Amarelo', '#e5c92c'],
  ['Azul', '#1f4ea5'],
] as const;

/** Kit Studio: academia de 15 × 10 m, a mesma do catálogo. Posições em metros (canto superior esquerdo). */
export interface ItemPlanta {
  code: string;
  /** Centro do equipamento na sala (m). */
  x: number;
  y: number;
  /** Giro em quartos de volta. */
  rot: number;
}
export interface Kit {
  id: string;
  nome: string;
  largura: number;
  profundidade: number;
  itens: ItemPlanta[];
}

function kitStudio(): Kit {
  const itens: ItemPlanta[] = [];
  const m = (code: string) => {
    const p = porCodigo.get(code)!;
    return { C: p.dim[0] / 1000, L: p.dim[1] / 1000 };
  };
  const fila = (codes: string[], x0: number, topo?: number, base?: number) => {
    let x = x0;
    for (const c of codes) {
      const { C, L } = m(c);
      const y = topo !== undefined ? topo : base! - C;
      // Fila de cima olha para o centro da sala; a de baixo também (gira meia volta).
      itens.push({ code: c, x: x + L / 2, y: y + C / 2, rot: topo !== undefined ? 0 : 2 });
      x += L + FOLGA;
    }
  };
  const B = (s: string) => s.split(' ').map((c) => `LD-${c}`);
  fila(B('B012 B020 B004 B008 B006 B018 B017'), 0.6, 0.35);
  fila(B('B003 B002 B016 B001 B014 B015'), 2.9, undefined, 10 - 0.35);
  const cx = m('LD-B038');
  itens.push({ code: 'LD-B038', x: 15 - 0.35 - cx.L / 2, y: 2.75 + cx.C / 2, rot: 0 });
  for (const [c, x, y] of [
    ['LD-A042', 6.3, 4.35],
    ['LD-A046', 7.75, 4.35],
    ['LD-A056', 9.35, 4.75],
  ] as const) {
    const { C, L } = m(c);
    itens.push({ code: c, x: x + L / 2, y: y + C / 2, rot: 0 });
  }
  return { id: 'studio', nome: 'Kit Studio · 150 m²', largura: 15, profundidade: 10, itens };
}

export const kits: Kit[] = [kitStudio()];
