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
  razaoSocial: 'Ludus Equipamentos para Musculação Ltda',
  marca: 'Ludus Premium',
  whatsapp: '(17) 99777-5154',
  whatsappNumero: '5517997775154',
  email: 'comercial@ludusequipamentos.com.br',
  cnpj: '66.058.955/0001-08' as string | null,
  inscricaoEstadual: '718.319.130.117' as string | null,
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
  titulo: string;
  resumo: string;
  largura: number;
  profundidade: number;
  itens: ItemPlanta[];
  /** Composição ainda não validada pela Ludus (montada a partir do catálogo). */
  sugerido: boolean;
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
  return {
    id: 'studio',
    nome: 'Kit Studio · 150 m²',
    titulo: 'Academia de 150 m²',
    resumo: 'Uma musculação completa em 15 × 10 m: corpo inteiro na bateria de pesos, área de peso livre e espaço para funcional.',
    largura: 15,
    profundidade: 10,
    itens,
    sugerido: false,
  };
}

/**
 * Distribui uma lista de equipamentos numa sala retangular: máquinas de bateria
 * encostadas nas paredes, de frente para o centro, e o restante em ilhas no
 * meio. O que não couber fica de fora.
 */
function distribuir(w: number, d: number, codes: string[]): ItemPlanta[] {
  const itens: ItemPlanta[] = [];
  const dim = (code: string) => {
    const p = porCodigo.get(code)!;
    return { C: p.dim[0] / 1000, L: p.dim[1] / 1000 };
  };
  const parede = codes.filter((c) => porCodigo.get(c)!.linha === 'Bateria de pesos');
  const ilha = codes.filter((c) => porCodigo.get(c)!.linha !== 'Bateria de pesos');
  const M = 0.35;
  const fila = [...parede];
  // Parede de cima, depois a de baixo (deixando a entrada livre), depois as laterais.
  let fundoCima = 0;
  let x = M + 0.3;
  while (fila.length && x + dim(fila[0]).L <= w - M - 0.3) {
    const c = fila.shift()!;
    const { C, L } = dim(c);
    itens.push({ code: c, x: x + L / 2, y: M + C / 2, rot: 0 });
    fundoCima = Math.max(fundoCima, C);
    x += L + FOLGA;
  }
  let fundoBaixo = 0;
  x = 2.9;
  while (fila.length && x + dim(fila[0]).L <= w - M - 0.3) {
    const c = fila.shift()!;
    const { C, L } = dim(c);
    itens.push({ code: c, x: x + L / 2, y: d - M - C / 2, rot: 2 });
    fundoBaixo = Math.max(fundoBaixo, C);
    x += L + FOLGA;
  }
  let fundoDir = 0;
  let y = M + fundoCima + 2 * FOLGA;
  while (fila.length && y + dim(fila[0]).L <= d - M - fundoBaixo - 2 * FOLGA) {
    const c = fila.shift()!;
    const { C, L } = dim(c);
    itens.push({ code: c, x: w - M - C / 2, y: y + L / 2, rot: 1 });
    fundoDir = Math.max(fundoDir, C);
    y += L + FOLGA;
  }
  // Ilhas no meio, em fileiras, com corredor entre elas.
  const x0 = 5.5;
  const x1 = w - M - fundoDir - 2 * FOLGA - 0.6;
  let yy = M + fundoCima + 2 * FOLGA + 0.9;
  const yMax = d - M - fundoBaixo - 2 * FOLGA - 0.9;
  let xx = x0;
  let alturaFileira = 0;
  for (const c of [...ilha, ...fila]) {
    const { C, L } = dim(c);
    if (xx + L > x1) {
      xx = x0;
      yy += alturaFileira + 2 * FOLGA + 0.6;
      alturaFileira = 0;
    }
    if (yy + C > yMax || xx + L > x1) continue;
    itens.push({ code: c, x: xx + L / 2, y: yy + C / 2, rot: 0 });
    alturaFileira = Math.max(alturaFileira, C);
    xx += L + 2 * FOLGA;
  }
  return itens;
}

const LD = (s: string) => s.split(' ').map((c) => `LD-${c}`);
const kitAcademia: Kit = {
  id: 'academia',
  nome: 'Kit Academia · 300 m²',
  titulo: 'Academia de 300 m²',
  resumo: 'Bateria de pesos para o corpo inteiro nas paredes e uma área de peso livre articulado e bancos no centro, em 20 × 15 m.',
  largura: 20,
  profundidade: 15,
  itens: distribuir(
    20,
    15,
    LD('B012 B020 B004 B008 B006 B005 B018 B017 B013 B003 B002 B016 B001 B014 B015 B011 B010 B019 B009 B021 A034 A023 A002 A013 A005 A011 A012 A050 A051 A042 A046 A048 A056 A053')
  ),
  sugerido: true,
};
const kitCompleta: Kit = {
  id: 'completa',
  nome: 'Kit Completa · 600 m²',
  titulo: 'Academia de 600 m²',
  resumo: 'A linha de bateria de pesos inteira, peso livre articulado para todos os grupos musculares, crossover e bancos, em 30 × 20 m.',
  largura: 30,
  profundidade: 20,
  itens: distribuir(30, 20, [
    ...produtos.filter((p) => p.linha === 'Bateria de pesos' && p.code !== 'LD-B038' && p.code !== 'LD-B036').map((p) => p.code),
    ...LD('A034 A023 A038 A041 A030 A036 A002 A003 A007 A013 A014 A004 A005 A006 A009 A011 A015 A012 A016 A018 A033 A022 A021 A027 A025 A050 A051 A052 A042 A044 A046 A048 A043 A054 A055 A056 A053'),
  ]),
  sugerido: true,
};

export const kits: Kit[] = [kitStudio(), kitAcademia, kitCompleta];
