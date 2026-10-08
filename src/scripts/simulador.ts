/**
 * Simulador "Monte sua academia": planta em escala com arrastar, girar livre,
 * encaixe, obstáculos da sala, sugestão automática de layout, projetos salvos,
 * exportação (PDF e PNG) e a visão 3D editável da sala montada.
 *
 * Coordenadas da planta em metros: origem no canto superior esquerdo da sala,
 * x para a direita, y para baixo. A frente do equipamento aponta para baixo
 * quando ang = 0; o ângulo cresce no sentido horário, em graus.
 */
import type * as TH from 'three';

interface ProdutoSim {
  code: string;
  nome: string;
  linha: string;
  grupo: string;
  slug: string;
  /** Comprimento (profundidade) e largura, em metros. */
  c: number;
  l: number;
  foto: string;
}
interface Item {
  id: number;
  code: string;
  x: number;
  y: number;
  /** Giro em graus, sentido horário na planta. */
  ang: number;
}
type TipoObst = 'pilar' | 'porta' | 'bloco';
interface Obst {
  id: number;
  t: TipoObst;
  /** Centro (pilar e área bloqueada) ou centro do vão sobre a parede (porta). */
  x: number;
  y: number;
  /** Largura e profundidade; na porta, w é o vão e h não é usado. */
  w: number;
  h: number;
  /** Só na porta: parede em que ela está. 0 = cima, 1 = direita, 2 = baixo, 3 = esquerda. */
  lado: number;
}
interface Estado {
  w: number;
  d: number;
  nome: string;
  itens: Item[];
  obst: Obst[];
}
interface Kit {
  id: string;
  nome: string;
  largura: number;
  profundidade: number;
  itens: { code: string; x: number; y: number; rot: number }[];
}
interface Silhueta {
  parts: [number, number][][];
}
/** Retângulo orientado: centro, meias medidas e ângulo em graus. */
interface Ret {
  x: number;
  y: number;
  hw: number;
  hh: number;
  ang: number;
}
interface Lim {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
type Guia = [number, number, number, number];
interface ProjetoSalvo {
  id: string;
  nome: string;
  dados: string;
  em: string;
}

const dados = JSON.parse(document.getElementById('dados')!.textContent!) as {
  produtos: ProdutoSim[];
  kits: Kit[];
  folga: number;
  whatsapp: string;
};
const P = new Map(dados.produtos.map((p) => [p.code, p]));
const FOLGA = dados.folga;
const CHAVE = 'ludus-simulador-v1';
const CHAVE_PROJETOS = 'ludus-simulador-projetos';
const NS = 'http://www.w3.org/2000/svg';
/** Faixa livre reservada à frente de cada porta (m). */
const FAIXA = 1.2;
/** Distância máxima para o encaixe agir (m). */
const ENCAIXE = 0.08;
const NOME_OBST: Record<TipoObst, string> = { pilar: 'Pilar', porta: 'Porta', bloco: 'Área bloqueada' };

const silhuetaUrls = import.meta.glob<string>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/models/*/footprint.json',
  { eager: true, query: '?url', import: 'default' }
);
const specLoaders = import.meta.glob<Record<string, unknown>>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/specs/*.json',
  { import: 'default' }
);
const silhuetas = new Map<string, Silhueta>();
const pedidos = new Map<string, Promise<void>>();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('planta') as unknown as SVGSVGElement;
const palco = $('palco');
const fmt = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: unknown, padrao: number) => (typeof v === 'number' && Number.isFinite(v) ? v : padrao);
const limitar = (v: number, a: number, b: number) => Math.min(Math.max(v, a), Math.max(a, b));
const norm = (a: number) => ((Math.round(a) % 360) + 360) % 360;
const grade = (v: number) => Math.round(v / 0.05) * 0.05;

let estado: Estado = { w: 15, d: 10, nome: '', itens: [], obst: [] };
let proximoId = 1;
/** Id do equipamento ou do obstáculo selecionado (a numeração é única entre os dois). */
let selecionado: number | null = null;
let modo: 'planta' | '3d' = 'planta';

const itemSel = () => estado.itens.find((x) => x.id === selecionado);
const obstSel = () => estado.obst.find((x) => x.id === selecionado);

// ── estado: URL, armazenamento local e link compartilhável ──────────────────
const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const deB64 = (s: string) => {
  const bruto = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bruto, (c) => c.charCodeAt(0)));
  } catch {
    return bruto;
  }
};
/** Formato atual: objeto com versão. Os links antigos eram `[w, d, [[code, x, y, rot], ...]]`. */
const codificar = (e: Estado) =>
  b64(
    JSON.stringify({
      v: 2,
      w: e.w,
      d: e.d,
      ...(e.nome ? { n: e.nome } : {}),
      i: e.itens.map((i) => [i.code, +i.x.toFixed(2), +i.y.toFixed(2), norm(i.ang)]),
      ...(e.obst.length
        ? { o: e.obst.map((o) => [o.t, +o.x.toFixed(2), +o.y.toFixed(2), +o.w.toFixed(2), +o.h.toFixed(2), o.lado]) }
        : {}),
    })
  );
function decodificar(s: string): Estado | null {
  try {
    const bruto = JSON.parse(deB64(s)) as unknown;
    const antigo = Array.isArray(bruto);
    const o = (antigo ? { w: bruto[0], d: bruto[1], i: bruto[2] } : bruto) as Record<string, unknown>;
    const w = limitar(num(o.w, 15), 3, 60);
    const d = limitar(num(o.d, 10), 3, 60);
    const itens = (Array.isArray(o.i) ? (o.i as unknown[][]) : [])
      .filter((t) => Array.isArray(t) && P.has(String(t[0])))
      .map((t) => ({
        id: proximoId++,
        code: String(t[0]),
        x: num(t[1], w / 2),
        y: num(t[2], d / 2),
        // No formato antigo o giro vinha em quartos de volta (0 a 3).
        ang: norm(num(t[3], 0) * (antigo ? 90 : 1)),
      }));
    const obst = (Array.isArray(o.o) ? (o.o as unknown[][]) : [])
      .filter((t) => Array.isArray(t) && ['pilar', 'porta', 'bloco'].includes(String(t[0])))
      .map((t) => ({
        id: proximoId++,
        t: String(t[0]) as TipoObst,
        x: num(t[1], 1),
        y: num(t[2], 1),
        w: limitar(num(t[3], 0.4), 0.1, 60),
        h: limitar(num(t[4], 0.4), 0.1, 60),
        lado: limitar(Math.round(num(t[5], 0)), 0, 3),
      }));
    return { w, d, nome: typeof o.n === 'string' ? o.n.slice(0, 40) : '', itens, obst };
  } catch {
    return null;
  }
}
const doKit = (k: Kit): Estado => ({
  w: k.largura,
  d: k.profundidade,
  nome: '',
  itens: k.itens.map((i) => ({ id: proximoId++, code: i.code, x: i.x, y: i.y, ang: norm(i.rot * 90) })),
  obst: [],
});
const linkDoProjeto = () => `${location.origin}/simulador/#p=${codificar(estado)}`;
function salvar() {
  try {
    localStorage.setItem(CHAVE, codificar(estado));
  } catch {
    /* sem armazenamento local: o projeto vive só nesta aba */
  }
}

// ── geometria ───────────────────────────────────────────────────────────────
const rad = (g: number) => (g * Math.PI) / 180;
const retItem = (i: Item, margem = 0): Ret => {
  const p = P.get(i.code)!;
  return { x: i.x, y: i.y, hw: p.l / 2 + margem, hh: p.c / 2 + margem, ang: i.ang };
};
/** Área que o obstáculo tira dos equipamentos: o próprio corpo ou, na porta, a faixa livre à frente. */
function retObst(o: Obst): Ret {
  if (o.t !== 'porta') return { x: o.x, y: o.y, hw: o.w / 2, hh: o.h / 2, ang: 0 };
  const f = FAIXA / 2;
  if (o.lado === 0) return { x: o.x, y: f, hw: o.w / 2, hh: f, ang: 0 };
  if (o.lado === 2) return { x: o.x, y: estado.d - f, hw: o.w / 2, hh: f, ang: 0 };
  if (o.lado === 3) return { x: f, y: o.y, hw: f, hh: o.w / 2, ang: 0 };
  return { x: estado.w - f, y: o.y, hw: f, hh: o.w / 2, ang: 0 };
}
function cantos(r: Ret): [number, number][] {
  const c = Math.cos(rad(r.ang));
  const s = Math.sin(rad(r.ang));
  return (
    [
      [-r.hw, -r.hh],
      [r.hw, -r.hh],
      [r.hw, r.hh],
      [-r.hw, r.hh],
    ] as const
  ).map(([px, py]) => [r.x + px * c - py * s, r.y + px * s + py * c]);
}
/** Caixa alinhada aos eixos que envolve o retângulo girado. */
function limites(r: Ret): Lim {
  const c = Math.abs(Math.cos(rad(r.ang)));
  const s = Math.abs(Math.sin(rad(r.ang)));
  const ex = c * r.hw + s * r.hh;
  const ey = s * r.hw + c * r.hh;
  return { x0: r.x - ex, x1: r.x + ex, y0: r.y - ey, y1: r.y + ey };
}
/** Sobreposição de dois retângulos orientados pelo teorema do eixo separador. Encostar não conta. */
function colide(a: Ret, b: Ret): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const alcance = Math.hypot(a.hw, a.hh) + Math.hypot(b.hw, b.hh);
  if (dx * dx + dy * dy > alcance * alcance) return false;
  const ca = cantos(a);
  const cb = cantos(b);
  for (const r of [a, b]) {
    const c = Math.cos(rad(r.ang));
    const s = Math.sin(rad(r.ang));
    for (const [ex, ey] of [
      [c, s],
      [-s, c],
    ]) {
      let a0 = Infinity;
      let a1 = -Infinity;
      let b0 = Infinity;
      let b1 = -Infinity;
      for (const [px, py] of ca) {
        const v = px * ex + py * ey;
        a0 = Math.min(a0, v);
        a1 = Math.max(a1, v);
      }
      for (const [px, py] of cb) {
        const v = px * ex + py * ey;
        b0 = Math.min(b0, v);
        b1 = Math.max(b1, v);
      }
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
    }
  }
  return true;
}
const dentroDe = (r: Ret, x: number, y: number) => {
  const c = Math.cos(rad(r.ang));
  const s = Math.sin(rad(r.ang));
  const dx = x - r.x;
  const dy = y - r.y;
  return Math.abs(dx * c + dy * s) <= r.hw && Math.abs(-dx * s + dy * c) <= r.hh;
};
function prender(i: Item) {
  const l = limites(retItem(i));
  const ex = (l.x1 - l.x0) / 2;
  const ey = (l.y1 - l.y0) / 2;
  i.x = limitar(i.x, ex, estado.w - ex);
  i.y = limitar(i.y, ey, estado.d - ey);
}
function prenderObst(o: Obst) {
  if (o.t === 'porta') {
    const horizontal = o.lado === 0 || o.lado === 2;
    o.w = limitar(o.w, 0.6, Math.min(3, horizontal ? estado.w : estado.d));
    if (horizontal) {
      o.x = limitar(o.x, o.w / 2, estado.w - o.w / 2);
      o.y = o.lado === 0 ? 0 : estado.d;
    } else {
      o.y = limitar(o.y, o.w / 2, estado.d - o.w / 2);
      o.x = o.lado === 3 ? 0 : estado.w;
    }
    return;
  }
  const min = o.t === 'pilar' ? 0.1 : 0.5;
  o.w = limitar(o.w, min, o.t === 'pilar' ? 3 : estado.w);
  o.h = limitar(o.h, min, o.t === 'pilar' ? 3 : estado.d);
  o.x = limitar(o.x, o.w / 2, estado.w - o.w / 2);
  o.y = limitar(o.y, o.h / 2, estado.d - o.h / 2);
}
const foraDaSala = (i: Item) => {
  const l = limites(retItem(i));
  return l.x1 - l.x0 > estado.w + 1e-6 || l.y1 - l.y0 > estado.d + 1e-6;
};
const bateEquip = (i: Item) => estado.itens.some((o) => o !== i && colide(retItem(i), retItem(o)));
const bateObst = (i: Item) => estado.obst.some((o) => colide(retItem(i), retObst(o)));
const ruim = (i: Item) => foraDaSala(i) || bateEquip(i) || bateObst(i);
/** Primeiro lugar livre varrendo a sala (com a folga entre as máquinas e fora dos obstáculos). */
function lugarLivre(novo: Item) {
  const l = limites(retItem(novo));
  const w = l.x1 - l.x0;
  const h = l.y1 - l.y0;
  const fixos = estado.obst.map(retObst);
  for (let y = h / 2 + 0.3; y <= estado.d - h / 2 - 0.3 + 1e-6; y += 0.25) {
    for (let x = w / 2 + 0.3; x <= estado.w - w / 2 - 0.3 + 1e-6; x += 0.25) {
      novo.x = x;
      novo.y = y;
      const r = retItem(novo, FOLGA);
      if (!estado.itens.some((o) => colide(r, retItem(o))) && !fixos.some((f) => colide(retItem(novo), f))) return;
    }
  }
  novo.x = estado.w / 2;
  novo.y = estado.d / 2;
}

/**
 * Encaixe: aproxima as bordas e o centro da caixa `m` das bordas e centros dos
 * vizinhos próximos e das paredes. Devolve o deslocamento e as linhas guia.
 */
function encaixe(id: number, m: Lim): { dx: number; dy: number; guias: Guia[] } {
  interface Cand {
    d: number;
    pos: number;
    a: number;
    b: number;
  }
  const melhor: { x: Cand | null; y: Cand | null } = { x: null, y: null };
  const ver = (eixo: 'x' | 'y', meu: number, alvo: number, a: number, b: number) => {
    const d = alvo - meu;
    const atual = melhor[eixo];
    if (Math.abs(d) < ENCAIXE && (!atual || Math.abs(d) < Math.abs(atual.d))) melhor[eixo] = { d, pos: alvo, a, b };
  };
  ver('x', m.x0, 0, 0, estado.d);
  ver('x', m.x1, estado.w, 0, estado.d);
  ver('y', m.y0, 0, 0, estado.w);
  ver('y', m.y1, estado.d, 0, estado.w);
  const outros: Lim[] = [];
  for (const i of estado.itens) if (i.id !== id) outros.push(limites(retItem(i)));
  for (const o of estado.obst) if (o.id !== id && o.t !== 'porta') outros.push(limites(retObst(o)));
  const mcx = (m.x0 + m.x1) / 2;
  const mcy = (m.y0 + m.y1) / 2;
  for (const o of outros) {
    const vaoX = Math.max(0, Math.max(m.x0, o.x0) - Math.min(m.x1, o.x1));
    const vaoY = Math.max(0, Math.max(m.y0, o.y0) - Math.min(m.y1, o.y1));
    if (vaoX > 2.5 || vaoY > 2.5) continue;
    const ya = Math.min(m.y0, o.y0);
    const yb = Math.max(m.y1, o.y1);
    const xa = Math.min(m.x0, o.x0);
    const xb = Math.max(m.x1, o.x1);
    for (const meu of [m.x0, m.x1]) for (const alvo of [o.x0, o.x1]) ver('x', meu, alvo, ya, yb);
    ver('x', mcx, (o.x0 + o.x1) / 2, ya, yb);
    for (const meu of [m.y0, m.y1]) for (const alvo of [o.y0, o.y1]) ver('y', meu, alvo, xa, xb);
    ver('y', mcy, (o.y0 + o.y1) / 2, xa, xb);
  }
  const guias: Guia[] = [];
  if (melhor.x) guias.push([melhor.x.pos, melhor.x.a, melhor.x.pos, melhor.x.b]);
  if (melhor.y) guias.push([melhor.y.a, melhor.y.pos, melhor.y.b, melhor.y.pos]);
  return { dx: melhor.x?.d ?? 0, dy: melhor.y?.d ?? 0, guias };
}
/** Leva o equipamento para (x, y) com grade de 5 cm, encaixe (se ligado) e limites da sala. */
function moverItem(i: Item, x: number, y: number, comEncaixe: boolean): Guia[] {
  i.x = grade(x);
  i.y = grade(y);
  prender(i);
  if (!comEncaixe) return [];
  const e = encaixe(i.id, limites(retItem(i)));
  const antes = { x: i.x + e.dx, y: i.y + e.dy };
  i.x = antes.x;
  i.y = antes.y;
  prender(i);
  // Se a parede segurou o movimento, a guia daquele eixo deixou de valer.
  return e.guias.filter((g) => (g[0] === g[2] ? Math.abs(i.x - antes.x) < 1e-6 : Math.abs(i.y - antes.y) < 1e-6));
}

function pedirSilhueta(code: string): Promise<void> {
  const ja = pedidos.get(code);
  if (ja) return ja;
  const url = Object.entries(silhuetaUrls).find(([k]) => k.includes(`/${code}/`))?.[1];
  const p = (async () => {
    if (!url) return;
    try {
      silhuetas.set(code, await (await fetch(url)).json());
      agendarDesenho();
    } catch {
      /* sem a silhueta, fica o retângulo */
    }
  })();
  pedidos.set(code, p);
  return p;
}
let desenhoAgendado = 0;
function agendarDesenho() {
  if (desenhoAgendado) return;
  desenhoAgendado = requestAnimationFrame(() => {
    desenhoAgendado = 0;
    if (modo === 'planta' && !arraste) desenhar();
  });
}

// ── planta ──────────────────────────────────────────────────────────────────
/** Estilos da planta. Vão dentro do próprio SVG para valerem também no PDF e no PNG. */
const CSS_PLANTA = `
.pl .parede{fill:#141413}
.pl .piso{fill:#fbfaf7}
.pl .grade{stroke:#ebe8e1;stroke-width:.012}
.pl .zona{fill:#ebe4d7}
.pl .item{cursor:grab}
.pl .item .corpo{fill:transparent}
.pl .item polygon,.pl .item .bloco{fill:#141413}
.pl .item.ruim polygon,.pl .item.ruim .bloco{fill:#c0392b}
.pl .item.sel .corpo{stroke:#96764a;stroke-width:.05;stroke-dasharray:.12 .08}
.pl .dot{fill:#fff;stroke:#141413;stroke-width:.03}
.pl .item.ruim .dot{stroke:#c0392b}
.pl .n{font:600 .26px Barlow,Arial,sans-serif;text-anchor:middle;fill:#141413;pointer-events:none}
.pl .cota{font:500 .3px Barlow,Arial,sans-serif;text-anchor:middle;fill:#6d6a63}
.pl .obst{cursor:grab}
.pl .pilar{fill:#55524c;stroke:#141413;stroke-width:.03}
.pl .area{stroke:#8f8a80;stroke-width:.03}
.pl .rot{font:500 .22px Barlow,Arial,sans-serif;text-anchor:middle;fill:#55524c;pointer-events:none}
.pl .vao{fill:#fbfaf7}
.pl .faixa{fill:rgba(150,118,74,.14);stroke:#96764a;stroke-width:.025;stroke-dasharray:.1 .08}
.pl .folha,.pl .arco{fill:none;stroke:#141413;stroke-width:.04}
.pl .arco{stroke-width:.02;stroke-dasharray:.08 .06}
.pl .pega{fill:transparent}
.pl .obst.sel .pilar,.pl .obst.sel .area,.pl .obst.sel .faixa{stroke:#96764a;stroke-width:.06}
.pl .guia{stroke:#e0572a;stroke-width:.02;stroke-dasharray:.1 .06;pointer-events:none}
.pl .item:focus,.pl .obst:focus{outline:none}
.pl .item:focus-visible .corpo{stroke:#96764a;stroke-width:.07}
.pl .obst:focus-visible .pilar,.pl .obst:focus-visible .area,.pl .obst:focus-visible .faixa{stroke:#96764a;stroke-width:.09}
`;
const el = (tag: string, attrs: Record<string, string | number>, pai?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  pai?.appendChild(e);
  return e;
};
const n3 = (v: number) => +v.toFixed(3);

/** Desenha a planta em `alvo`. Com `limpo`, sai sem seleção nem foco (para PDF e PNG). */
function pintar(alvo: SVGSVGElement, uid: string, limpo = false) {
  const { w, d } = estado;
  alvo.setAttribute('viewBox', `-0.9 -0.9 ${w + 1.8} ${d + 1.8}`);
  alvo.classList.add('pl');
  alvo.replaceChildren();
  el('style', {}, alvo).textContent = CSS_PLANTA;
  const defs = el('defs', {}, alvo);
  el('rect', { x: 0, y: 0, width: w, height: d }, el('clipPath', { id: `sala-${uid}` }, defs));
  const hachura = el(
    'pattern',
    { id: `hach-${uid}`, width: 0.3, height: 0.3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
    defs
  );
  el('rect', { width: 0.3, height: 0.3, fill: '#e4e0d7' }, hachura);
  el('line', { x1: 0, y1: 0, x2: 0, y2: 0.3, stroke: '#bdb7ab', 'stroke-width': 0.06 }, hachura);

  el('rect', { class: 'parede', x: -0.14, y: -0.14, width: w + 0.28, height: d + 0.28 }, alvo);
  el('rect', { class: 'piso', x: 0, y: 0, width: w, height: d }, alvo);
  for (let x = 1; x < w; x++) el('line', { class: 'grade', x1: x, y1: 0, x2: x, y2: d }, alvo);
  for (let y = 1; y < d; y++) el('line', { class: 'grade', x1: 0, y1: y, x2: w, y2: y }, alvo);
  el('text', { class: 'cota', x: w / 2, y: -0.38 }, alvo).textContent = `${fmt(w, 1)} m`;
  const cy = el('text', { class: 'cota', x: -0.42, y: d / 2, transform: `rotate(-90 -0.42 ${d / 2})` }, alvo);
  cy.textContent = `${fmt(d, 1)} m`;

  // Áreas de treino primeiro, para obstáculos e máquinas ficarem por cima.
  const zonas = el('g', { 'clip-path': `url(#sala-${uid})` }, alvo);
  for (const i of estado.itens) {
    const r = retItem(i, FOLGA);
    el(
      'rect',
      {
        class: 'zona',
        'data-zona': i.id,
        x: -r.hw,
        y: -r.hh,
        width: 2 * r.hw,
        height: 2 * r.hh,
        transform: `translate(${n3(i.x)} ${n3(i.y)}) rotate(${i.ang})`,
      },
      zonas
    );
  }

  for (const o of estado.obst) {
    const g = el(
      'g',
      {
        class: `obst${!limpo && o.id === selecionado ? ' sel' : ''}`,
        'data-id': o.id,
        ...(limpo ? {} : { tabindex: 0, role: 'button', 'aria-label': `${NOME_OBST[o.t]}, obstáculo da sala` }),
      },
      alvo
    );
    if (o.t === 'porta') {
      // No referencial da porta a parede corre em x e a sala fica para +y.
      g.setAttribute('transform', `translate(${n3(o.x)} ${n3(o.y)}) rotate(${o.lado * 90})`);
      const m = o.w / 2;
      el('rect', { class: 'faixa', x: -m, y: 0, width: o.w, height: FAIXA }, g);
      el('rect', { class: 'vao', x: -m, y: -0.15, width: o.w, height: 0.15 }, g);
      el('line', { class: 'folha', x1: -m, y1: 0, x2: -m, y2: o.w }, g);
      el('path', { class: 'arco', d: `M ${-m} ${o.w} A ${o.w} ${o.w} 0 0 0 ${m} 0` }, g);
      el('rect', { class: 'pega', x: -m, y: -0.3, width: o.w, height: FAIXA + 0.3 }, g);
    } else {
      g.setAttribute('transform', `translate(${n3(o.x)} ${n3(o.y)})`);
      el(
        'rect',
        {
          class: o.t === 'pilar' ? 'pilar' : 'area',
          x: -o.w / 2,
          y: -o.h / 2,
          width: o.w,
          height: o.h,
          ...(o.t === 'bloco' ? { fill: `url(#hach-${uid})` } : {}),
        },
        g
      );
      if (o.t === 'bloco' && o.w >= 1.9 && o.h >= 0.5)
        el('text', { class: 'rot', x: 0, y: 0, 'dominant-baseline': 'central' }, g).textContent = 'Área bloqueada';
      // Pilar fino continua fácil de pegar com o dedo.
      if (o.t === 'pilar') {
        const t = Math.max(o.w, 0.7);
        const u = Math.max(o.h, 0.7);
        el('rect', { class: 'pega', x: -t / 2, y: -u / 2, width: t, height: u }, g);
      }
    }
  }

  estado.itens.forEach((i, k) => {
    const p = P.get(i.code)!;
    const g = el(
      'g',
      {
        class: `item${ruim(i) ? ' ruim' : ''}${!limpo && i.id === selecionado ? ' sel' : ''}`,
        'data-id': i.id,
        transform: `translate(${n3(i.x)} ${n3(i.y)})`,
        ...(limpo ? {} : { tabindex: 0, role: 'button', 'aria-label': `${k + 1}. ${p.nome}` }),
      },
      alvo
    );
    const giro = el('g', { class: 'giro', transform: `rotate(${i.ang})` }, g);
    el('rect', { class: 'corpo', x: -p.l / 2, y: -p.c / 2, width: p.l, height: p.c, rx: 0.04 }, giro);
    const s = silhuetas.get(i.code);
    if (s) {
      for (const part of s.parts)
        el('polygon', { points: part.map((pt) => pt.map((v) => v.toFixed(3)).join(',')).join(' ') }, giro);
    } else {
      el('rect', { class: 'bloco', x: -p.l / 2, y: -p.c / 2, width: p.l, height: p.c, opacity: 0.35 }, giro);
      pedirSilhueta(i.code);
    }
    el('circle', { class: 'dot', cx: 0, cy: 0, r: 0.23 }, g);
    el('text', { class: 'n', x: 0, y: 0, 'dominant-baseline': 'central' }, g).textContent = String(k + 1);
  });
  if (!limpo) el('g', { class: 'guias' }, alvo);
}

function desenhar() {
  // Redesenhar troca os elementos: devolve o foco ao selecionado para o teclado continuar valendo.
  const tinhaFoco = svg.contains(document.activeElement);
  pintar(svg, 'tela');
  if (tinhaFoco && selecionado !== null)
    svg.querySelector<SVGGElement>(`[data-id="${selecionado}"]`)?.focus({ preventScroll: true });
}
function mostrarGuias(guias: Guia[]) {
  const g = svg.querySelector('.guias');
  if (!g) return;
  g.replaceChildren();
  for (const [x1, y1, x2, y2] of guias) el('line', { class: 'guia', x1: n3(x1), y1: n3(y1), x2: n3(x2), y2: n3(y2) }, g);
}

/** Números do projeto: áreas medidas numa grade de 10 cm. */
function medir() {
  const { w, d, itens, obst } = estado;
  const ocup = itens.reduce((a, i) => a + P.get(i.code)!.c * P.get(i.code)!.l, 0);
  const blocos = obst.filter((o) => o.t === 'bloco').map(retObst);
  const pilares = obst.filter((o) => o.t === 'pilar').map(retObst);
  const zonas = itens.map((i) => ({ r: retItem(i, FOLGA), l: limites(retItem(i, FOLGA)) }));
  // Em salas muito grandes a grade fica mais grossa para a conta não travar a tela.
  const g = w * d > 1000 ? 0.25 : 0.1;
  let util = 0;
  let livre = 0;
  for (let x = g / 2; x < w; x += g)
    for (let y = g / 2; y < d; y += g) {
      if (blocos.some((r) => dentroDe(r, x, y))) continue;
      util += g * g;
      if (pilares.some((r) => dentroDe(r, x, y))) continue;
      if (!zonas.some((z) => x >= z.l.x0 && x <= z.l.x1 && y >= z.l.y0 && y <= z.l.y1 && dentroDe(z.r, x, y)))
        livre += g * g;
    }
  return { sala: obst.some((o) => o.t === 'bloco') ? util : w * d, ocup, livre };
}

function resumo() {
  const { w, d, itens, obst } = estado;
  const m = medir();
  $('r-n').textContent = String(itens.length);
  $('r-sala').textContent = `${fmt(m.sala)} m²`;
  $('r-ocup').textContent = `${fmt(m.ocup)} m²`;
  $('r-livre').textContent = `${fmt(Math.max(0, m.livre))} m²`;

  const batendo = itens.filter(bateEquip).length;
  const noObst = itens.filter((i) => !bateEquip(i) && bateObst(i)).length;
  const grandes = itens.filter(foraDaSala).length;
  const aviso = $('aviso');
  aviso.hidden = !batendo && !grandes && !noObst;
  aviso.textContent = [
    batendo ? `${batendo} equipamentos estão sobrepostos (em vermelho). Arraste para separar.` : '',
    noObst
      ? `${noObst} ${noObst > 1 ? 'equipamentos estão' : 'equipamento está'} sobre um obstáculo ou na passagem de uma porta (em vermelho).`
      : '',
    grandes ? `${grandes} não cabem na sala com essas medidas.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ol = $('itens');
  ol.replaceChildren(
    ...itens.map((i, k) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${k + 1}</span><div><b>${P.get(i.code)!.nome}</b> <small>${i.code}</small></div>`;
      li.onclick = () => selecionar(i.id);
      return li;
    })
  );
  $('dica').hidden = itens.length > 0 || obst.length > 0 || modo === '3d';

  const contagem = new Map<string, number>();
  itens.forEach((i) => contagem.set(i.code, (contagem.get(i.code) ?? 0) + 1));
  const linhas = [...contagem].map(([c, n]) => `${n > 1 ? `${n}x ` : ''}${P.get(c)!.nome} (${c})`);
  const comObst = obst.length ? `, sala com ${obst.length} ${obst.length > 1 ? 'obstáculos' : 'obstáculo'}` : '';
  const msg = itens.length
    ? `Olá! Montei minha academia no simulador da Ludus e quero um orçamento.\n\n${estado.nome ? `Projeto: ${estado.nome}\n` : ''}Sala: ${fmt(w, 1)} x ${fmt(d, 1)} m (${fmt(m.sala)} m²${comObst})\nEquipamentos (${itens.length}):\n- ${linhas.join('\n- ')}\n\nPlanta: ${linkDoProjeto()}`
    : 'Olá! Estou montando minha academia e quero ajuda da Ludus com o projeto.';
  ($('b-wa') as HTMLAnchorElement).href = `https://wa.me/${dados.whatsapp}?text=${encodeURIComponent(msg)}`;
}

function selecionar(id: number | null) {
  selecionado = id;
  const i = itemSel();
  const o = obstSel();
  $('sel').hidden = !i;
  $('sel-obst').hidden = !o;
  if (i) {
    const p = P.get(i.code)!;
    $('sel-nome').textContent = `${p.nome} · ${i.code} · ${norm(i.ang)}°`;
    ($('b-ver') as HTMLAnchorElement).href = `/loja/${p.slug}/`;
  }
  if (o) {
    $('obst-nome').textContent = NOME_OBST[o.t];
    const ow = $('o-larg') as HTMLInputElement;
    const oh = $('o-prof') as HTMLInputElement;
    if (document.activeElement !== ow) ow.value = String(+o.w.toFixed(2));
    if (document.activeElement !== oh) oh.value = String(+o.h.toFixed(2));
    $('o-larg-rot').textContent = o.t === 'porta' ? 'Vão' : 'Largura';
    $('o-prof-campo').hidden = o.t === 'porta';
    $('obst-nota').textContent =
      o.t === 'porta'
        ? `Arraste para outra parede. Ficam ${fmt(FAIXA, 1)} m livres à frente.`
        : o.t === 'bloco'
          ? 'Use para recortar a sala ou marcar recepção e banheiro.'
          : '';
  }
  svg
    .querySelectorAll('.item, .obst')
    .forEach((g) => g.classList.toggle('sel', Number(g.getAttribute('data-id')) === id));
  cena?.marcar();
}

let apagaStatus = 0;
function avisar(msg: string) {
  const s = $('status');
  s.textContent = msg;
  s.hidden = !msg;
  clearTimeout(apagaStatus);
  if (msg) apagaStatus = window.setTimeout(() => avisar(''), 12000);
}

function mudou() {
  salvar();
  if (modo === 'planta') desenhar();
  else cena?.sincronizar();
  resumo();
}

function adicionar(code: string, ang = 0) {
  const novo: Item = { id: proximoId++, code, x: 0, y: 0, ang };
  lugarLivre(novo);
  estado.itens.push(novo);
  mudou();
  selecionar(novo.id);
}
function adicionarObst(t: TipoObst) {
  const { w, d } = estado;
  const n = estado.obst.filter((o) => o.t === t).length;
  const o: Obst =
    t === 'pilar'
      ? { id: proximoId++, t, x: w / 2 + n * 0.8, y: d / 2, w: 0.4, h: 0.4, lado: 0 }
      : t === 'porta'
        ? { id: proximoId++, t, x: w / 2 + n * 1.5, y: d, w: 0.9, h: FAIXA, lado: 2 }
        : { id: proximoId++, t, x: w - 1.5, y: d - 1 - n * 0.5, w: Math.min(3, w / 2), h: Math.min(2, d / 2), lado: 0 };
  prenderObst(o);
  estado.obst.push(o);
  mudou();
  selecionar(o.id);
  avisar(
    t === 'porta'
      ? 'Porta adicionada na parede de baixo. Arraste para a parede certa.'
      : `${NOME_OBST[t]} adicionado. Arraste para o lugar e ajuste as medidas.`
  );
}
/** Gruda a porta na parede mais próxima do ponto (x, y). */
function levarPorta(o: Obst, x: number, y: number) {
  const { w, d } = estado;
  const dist = [y, w - x, d - y, x];
  o.lado = dist.indexOf(Math.min(...dist));
  o.x = grade(x);
  o.y = grade(y);
  prenderObst(o);
}

// ── arrastar na planta ──────────────────────────────────────────────────────
function ponto(ev: PointerEvent) {
  const m = svg.getScreenCTM()!.inverse();
  return new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
}
let arraste:
  | { tipo: 'item'; item: Item; dx: number; dy: number; g: SVGGElement }
  | { tipo: 'obst'; o: Obst; dx: number; dy: number }
  | null = null;
let quadro = 0;
svg.addEventListener('pointerdown', (ev) => {
  const g = (ev.target as Element).closest<SVGGElement>('.item, .obst');
  if (!g) return selecionar(null);
  const id = Number(g.dataset.id);
  const p = ponto(ev);
  const item = estado.itens.find((i) => i.id === id);
  const o = estado.obst.find((x) => x.id === id);
  if (item) arraste = { tipo: 'item', item, dx: item.x - p.x, dy: item.y - p.y, g };
  else if (o) arraste = { tipo: 'obst', o, dx: o.t === 'porta' ? 0 : o.x - p.x, dy: o.t === 'porta' ? 0 : o.y - p.y };
  else return;
  selecionar(id);
  svg.setPointerCapture(ev.pointerId);
});
// Sem isto o arraste selecionaria o texto da página; o foco é dado à mão.
svg.addEventListener('mousedown', (ev) => {
  const g = (ev.target as Element).closest<SVGGElement>('.item, .obst');
  if (!g) return;
  ev.preventDefault();
  g.focus({ preventScroll: true });
});
svg.addEventListener('pointermove', (ev) => {
  if (!arraste) return;
  const p = ponto(ev);
  if (arraste.tipo === 'item') {
    const i = arraste.item;
    mostrarGuias(moverItem(i, p.x + arraste.dx, p.y + arraste.dy, !ev.altKey));
    arraste.g.setAttribute('transform', `translate(${n3(i.x)} ${n3(i.y)})`);
    arraste.g.classList.toggle('ruim', ruim(i));
    svg
      .querySelector(`[data-zona="${i.id}"]`)
      ?.setAttribute('transform', `translate(${n3(i.x)} ${n3(i.y)}) rotate(${i.ang})`);
    return;
  }
  const o = arraste.o;
  let guias: Guia[] = [];
  if (o.t === 'porta') levarPorta(o, p.x, p.y);
  else {
    o.x = grade(p.x + arraste.dx);
    o.y = grade(p.y + arraste.dy);
    prenderObst(o);
    if (!ev.altKey) {
      const e = encaixe(o.id, limites(retObst(o)));
      o.x += e.dx;
      o.y += e.dy;
      prenderObst(o);
      guias = e.guias;
    }
  }
  // Obstáculo mexe com o vermelho de vários equipamentos: redesenha, no máximo uma vez por quadro.
  cancelAnimationFrame(quadro);
  quadro = requestAnimationFrame(() => {
    desenhar();
    mostrarGuias(guias);
  });
});
const soltar = () => {
  if (!arraste) return;
  arraste = null;
  cancelAnimationFrame(quadro);
  const id = selecionado;
  mudou();
  selecionar(id);
};
svg.addEventListener('pointerup', soltar);
svg.addEventListener('pointercancel', soltar);
svg.addEventListener('focusin', (ev) => {
  const g = (ev.target as Element).closest<SVGGElement>('.item, .obst');
  if (g && !arraste && Number(g.dataset.id) !== selecionado) selecionar(Number(g.dataset.id));
});

// ── ações sobre o selecionado (valem na planta e no 3D) ─────────────────────
function depois(id: number | null) {
  mudou();
  selecionar(id);
}
function girarSel(graus: number) {
  const i = itemSel();
  if (!i) return;
  i.ang = norm(i.ang + graus);
  prender(i);
  depois(i.id);
}
function removerSel() {
  const antes = estado.itens.length + estado.obst.length;
  estado.itens = estado.itens.filter((x) => x.id !== selecionado);
  estado.obst = estado.obst.filter((x) => x.id !== selecionado);
  if (antes !== estado.itens.length + estado.obst.length) depois(null);
}
function duplicarSel() {
  const i = itemSel();
  if (i) adicionar(i.code, i.ang);
}
palco.addEventListener('keydown', (ev) => {
  const alvo = ev.target as HTMLElement;
  if (alvo.closest('input, textarea, select, summary, a') || ev.ctrlKey || ev.metaKey) return;
  const i = itemSel();
  const o = obstSel();
  if (!i && !o) return;
  const passo = ev.shiftKey ? 0.5 : 0.1;
  const mov: Record<string, [number, number]> = {
    ArrowLeft: [-passo, 0],
    ArrowRight: [passo, 0],
    ArrowUp: [0, -passo],
    ArrowDown: [0, passo],
  };
  const tecla = ev.key.toLowerCase();
  if (mov[ev.key]) {
    const alvoMov = i ?? o!;
    alvoMov.x += mov[ev.key][0];
    alvoMov.y += mov[ev.key][1];
    if (i) prender(i);
    else prenderObst(o!);
    depois(selecionado);
  } else if (i && tecla === 'r') girarSel(90);
  else if (i && tecla === 'q') girarSel(-15);
  else if (i && tecla === 'e') girarSel(15);
  else if (i && tecla === 'd') duplicarSel();
  else if ((ev.key === 'Delete' || ev.key === 'Backspace') && !alvo.closest('button')) removerSel();
  else if (ev.key === 'Escape') selecionar(null);
  else return;
  ev.preventDefault();
});

// ── cena 3D ─────────────────────────────────────────────────────────────────
interface Cena {
  /** Atualiza sala, obstáculos e só os equipamentos que mudaram. */
  sincronizar(): void;
  /** Reposiciona o anel de seleção. */
  marcar(): void;
  parar(): void;
}
let cena: Cena | null = null;
async function montarCena() {
  cena?.parar();
  const host = $('cena');
  host.replaceChildren();
  delete host.dataset.pronto;
  const espera = document.createElement('p');
  espera.className = 'espera';
  espera.textContent = 'Montando a sala em 3D…';
  host.append(espera);

  const [THREE, { OrbitControls }, { RoomEnvironment }, { generateEquipment }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('@avilaops/gerador-3d'),
  ]);
  if (modo !== '3d') return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eeece7');
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b3a6, 0.25));
  const sol = new THREE.DirectionalLight(0xffffff, 1.0);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0005;
  scene.add(sol);

  // Casca: piso, paredes e obstáculos. É barata, então é refeita a cada mudança.
  let casca = new THREE.Group();
  scene.add(casca);
  const descartar = (raiz: TH.Object3D) =>
    raiz.traverse((o) => {
      const m = o as TH.Mesh;
      m.geometry?.dispose();
      const mat = m.material as TH.Material | TH.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  const ALT = 2.7;
  function refazerCasca() {
    scene.remove(casca);
    descartar(casca);
    casca = new THREE.Group();
    scene.add(casca);
    const { w, d } = estado;
    const R = Math.max(w, d);
    sol.position.set(-0.5 * R, 1.4 * R, 0.8 * R);
    Object.assign(sol.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.1, far: 5 * R });
    sol.shadow.camera.updateProjectionMatrix();
    const caixa = (sx: number, sy: number, sz: number, mat: TH.Material, x: number, y: number, z: number, pai: TH.Object3D = casca) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
      m.position.set(x, y, z);
      m.receiveShadow = true;
      pai.add(m);
      return m;
    };
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color: '#3b3a37', roughness: 0.92, envMapIntensity: 0.2 })
    );
    piso.rotation.x = -Math.PI / 2;
    piso.receiveShadow = true;
    casca.add(piso);
    const parede = () => new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.95, envMapIntensity: 0.2 });
    caixa(w + 0.2, ALT, 0.1, parede(), 0, ALT / 2, -d / 2 - 0.05);
    caixa(0.1, ALT, d, parede(), -w / 2 - 0.05, ALT / 2, 0);
    for (const o of estado.obst) {
      if (o.t === 'pilar') {
        const m = caixa(o.w, ALT, o.h, new THREE.MeshStandardMaterial({ color: '#d5d1c8', roughness: 0.9, envMapIntensity: 0.2 }), o.x - w / 2, ALT / 2, o.y - d / 2);
        m.castShadow = true;
      } else if (o.t === 'bloco') {
        const mat = new THREE.MeshStandardMaterial({ color: '#96764a', roughness: 0.9, transparent: true, opacity: 0.32, depthWrite: false });
        caixa(o.w, 0.5, o.h, mat, o.x - w / 2, 0.25, o.y - d / 2);
      } else {
        // Porta: moldura do vão na linha da parede e a faixa livre marcada no piso.
        const g = new THREE.Group();
        g.position.set(o.x - w / 2, 0, o.y - d / 2);
        g.rotation.y = (-o.lado * Math.PI) / 2;
        casca.add(g);
        const moldura = () => new THREE.MeshStandardMaterial({ color: '#96764a', roughness: 0.6, envMapIntensity: 0.3 });
        caixa(0.07, 2.1, 0.12, moldura(), -o.w / 2, 1.05, 0, g);
        caixa(0.07, 2.1, 0.12, moldura(), o.w / 2, 1.05, 0, g);
        caixa(o.w + 0.07, 0.07, 0.12, moldura(), 0, 2.135, 0, g);
        caixa(o.w, 2.1, 0.02, new THREE.MeshBasicMaterial({ color: '#2a2927', transparent: true, opacity: 0.55, depthWrite: false }), 0, 1.05, 0.02, g);
        const faixa = new THREE.Mesh(
          new THREE.PlaneGeometry(o.w, FAIXA),
          new THREE.MeshBasicMaterial({ color: '#e0b06a', transparent: true, opacity: 0.35, depthWrite: false })
        );
        faixa.rotation.x = -Math.PI / 2;
        faixa.position.set(0, 0.012, FAIXA / 2);
        g.add(faixa);
      }
    }
  }

  // Equipamentos: um objeto por item, criado uma vez e depois só movido.
  const INTENS: Record<string, number> = { chrome: 1, upholstery: 0.18, rubber: 0.15, plate: 0.5 };
  const objs = new Map<number, { obj: TH.Object3D; descarta(): void }>();
  const pendentes = new Set<number>();
  let vivo = true;
  const colocar = (i: Item, obj: TH.Object3D) => {
    obj.position.set(i.x - estado.w / 2, 0, i.y - estado.d / 2);
    obj.rotation.y = -rad(i.ang);
  };
  const pronto = () => {
    if (!pendentes.size) host.dataset.pronto = '1';
  };
  async function criar(i: Item) {
    const loader = Object.entries(specLoaders).find(([k]) => k.endsWith(`/${i.code}.json`))?.[1];
    if (!loader) return;
    pendentes.add(i.id);
    delete host.dataset.pronto;
    try {
      const eq = generateEquipment((await loader()) as never);
      if (!vivo || !estado.itens.includes(i)) return eq.dispose();
      eq.object.userData.itemId = i.id;
      colocar(i, eq.object);
      eq.object.traverse((o) => {
        const mat = (o as unknown as { material?: { name: string; envMapIntensity?: number } }).material;
        if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = INTENS[mat.name] ?? 0.4;
      });
      scene.add(eq.object);
      objs.set(i.id, { obj: eq.object, descarta: () => eq.dispose() });
    } catch {
      /* um modelo com erro não derruba a sala */
    } finally {
      pendentes.delete(i.id);
      if (vivo) pronto();
    }
  }

  // Anel de seleção no piso e linhas guia do encaixe.
  const anel = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 72),
    new THREE.MeshBasicMaterial({ color: '#f0b45a', transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })
  );
  anel.rotation.x = -Math.PI / 2;
  anel.position.y = 0.02;
  anel.visible = false;
  scene.add(anel);
  const linhas = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ff7a45' }));
  linhas.frustumCulled = false;
  scene.add(linhas);
  const guias3d = (guias: Guia[]) => {
    const { w, d } = estado;
    linhas.geometry.setFromPoints(
      guias.flatMap(([x1, y1, x2, y2]) => [
        new THREE.Vector3(x1 - w / 2, 0.03, y1 - d / 2),
        new THREE.Vector3(x2 - w / 2, 0.03, y2 - d / 2),
      ])
    );
  };
  function marcar() {
    const i = itemSel();
    anel.visible = !!i;
    if (!i) return;
    const p = P.get(i.code)!;
    anel.scale.setScalar(Math.hypot(p.l, p.c) / 2 + 0.12);
    anel.position.set(i.x - estado.w / 2, 0.02, i.y - estado.d / 2);
    (anel.material as TH.MeshBasicMaterial).color.set(ruim(i) ? '#e5533d' : '#f0b45a');
  }
  function sincronizar() {
    refazerCasca();
    const vivos = new Set(estado.itens.map((i) => i.id));
    for (const [id, o] of objs)
      if (!vivos.has(id)) {
        scene.remove(o.obj);
        o.descarta();
        objs.delete(id);
      }
    for (const i of estado.itens) {
      const o = objs.get(i.id);
      if (o) colocar(i, o.obj);
      else if (!pendentes.has(i.id)) criar(i);
    }
    marcar();
    pronto();
  }

  host.replaceChildren(renderer.domElement);
  const R0 = Math.max(estado.w, estado.d);
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 400);
  camera.position.set(0.42 * R0, 0.62 * R0, 0.82 * R0);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 3 * R0;
  const ajustar = () => {
    const { clientWidth: cw, clientHeight: ch } = host;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(ajustar);
  ro.observe(host);
  ajustar();

  // Edição direta: clicar seleciona, arrastar move sobre o piso (plano y = 0).
  const raio = new THREE.Raycaster();
  const chao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const mira = (ev: PointerEvent) => {
    const r = renderer.domElement.getBoundingClientRect();
    raio.setFromCamera(
      new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1),
      camera
    );
  };
  const noChao = () => raio.ray.intersectPlane(chao, new THREE.Vector3());
  let puxando: { item: Item; dx: number; dz: number; ponteiro: number } | null = null;
  let toque: { x: number; y: number } | null = null;
  const aoDescer = (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    host.focus({ preventScroll: true });
    mira(ev);
    const alvo = raio.intersectObjects([...objs.values()].map((o) => o.obj), true)[0];
    let no: TH.Object3D | null = alvo?.object ?? null;
    while (no && no.userData.itemId === undefined) no = no.parent;
    const item = no ? estado.itens.find((i) => i.id === no!.userData.itemId) : undefined;
    const p = noChao();
    if (!item || !p) {
      toque = { x: ev.clientX, y: ev.clientY };
      return;
    }
    // O giro da câmera fica desligado enquanto um equipamento é arrastado.
    ev.stopPropagation();
    ev.preventDefault();
    controls.enabled = false;
    selecionar(item.id);
    puxando = { item, dx: item.x - estado.w / 2 - p.x, dz: item.y - estado.d / 2 - p.z, ponteiro: ev.pointerId };
    host.setPointerCapture(ev.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const aoMover = (ev: PointerEvent) => {
    if (!puxando || ev.pointerId !== puxando.ponteiro) return;
    ev.stopPropagation();
    mira(ev);
    const p = noChao();
    if (!p) return;
    const i = puxando.item;
    guias3d(moverItem(i, p.x + puxando.dx + estado.w / 2, p.z + puxando.dz + estado.d / 2, !ev.altKey));
    const o = objs.get(i.id);
    if (o) colocar(i, o.obj);
    marcar();
  };
  const aoSubir = (ev: PointerEvent) => {
    if (puxando && ev.pointerId === puxando.ponteiro) {
      ev.stopPropagation();
      puxando = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = '';
      guias3d([]);
      // Só o estado e o resumo: a cena já está no lugar.
      salvar();
      resumo();
      marcar();
    } else if (toque && Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) < 5 && ev.type === 'pointerup') {
      selecionar(null);
    }
    toque = null;
  };
  host.addEventListener('pointerdown', aoDescer, true);
  host.addEventListener('pointermove', aoMover, true);
  host.addEventListener('pointerup', aoSubir, true);
  host.addEventListener('pointercancel', aoSubir, true);

  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  const eu: Cena = {
    sincronizar,
    marcar,
    parar() {
      vivo = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      host.removeEventListener('pointerdown', aoDescer, true);
      host.removeEventListener('pointermove', aoMover, true);
      host.removeEventListener('pointerup', aoSubir, true);
      host.removeEventListener('pointercancel', aoSubir, true);
      controls.dispose();
      objs.forEach((o) => o.descarta());
      descartar(casca);
      anel.geometry.dispose();
      linhas.geometry.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (cena === eu) cena = null;
    },
  };
  cena = eu;
  sincronizar();
}

function trocarModo(novo: 'planta' | '3d') {
  if (novo === modo) return;
  modo = novo;
  document.querySelectorAll<HTMLButtonElement>('[data-modo]').forEach((b) => {
    const on = b.dataset.modo === novo;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  (svg as unknown as HTMLElement).style.display = novo === 'planta' ? '' : 'none';
  $('cena').hidden = novo !== '3d';
  $('grupo-obst').hidden = novo === '3d';
  $('dica-3d').hidden = novo !== '3d';
  if (novo === '3d') {
    // Obstáculo só se edita na planta; equipamento continua selecionado.
    if (obstSel()) selecionar(null);
    $('dica').hidden = true;
    montarCena();
  } else {
    cena?.parar();
    desenhar();
    resumo();
  }
}

// ── lista de equipamentos ───────────────────────────────────────────────────
let filtroLinha = '';
function listar() {
  const q = ($('q') as HTMLInputElement).value.trim().toLowerCase();
  const ul = $('lista');
  ul.replaceChildren(
    ...dados.produtos
      .filter((p) => (!filtroLinha || p.linha === filtroLinha) && (!q || `${p.code} ${p.nome}`.toLowerCase().includes(q)))
      .map((p) => {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Adicionar ${p.nome} (${p.code})`);
        b.innerHTML = `<img src="${p.foto}" alt="" loading="lazy" width="52" height="52" /><span><b>${p.nome}</b><small>${p.code} · ${fmt(p.l, 2)} × ${fmt(p.c, 2)} m</small></span><span class="mais" aria-hidden="true">+</span>`;
        b.onclick = () => adicionar(p.code);
        li.append(b);
        return li;
      })
  );
}

// ── sugestão automática de layout ───────────────────────────────────────────
interface Perfil {
  nome: string;
  /** Metros quadrados de sala por equipamento. */
  m2: number;
  /** Fração de bancos no total. */
  bancos: number;
  /** Sequência de linhas a alternar: B = bateria de pesos, L = peso livre. */
  padrao: ('B' | 'L')[];
}
const PERFIS: Record<string, Perfil> = {
  studio: { nome: 'Studio compacto', m2: 9, bancos: 0.08, padrao: ['B'] },
  completa: { nome: 'Musculação completa', m2: 8.5, bancos: 0.12, padrao: ['B', 'B', 'L'] },
  livre: { nome: 'Foco em peso livre', m2: 8.5, bancos: 0.2, padrao: ['L', 'L', 'B', 'L'] },
};
/** Rodízio de grupos musculares: pernas pesam mais, depois peito e costas, ombros e braços, abdômen. */
const RODIZIO = [
  'Pernas e glúteos',
  'Peitoral',
  'Costas',
  'Deltoides',
  'Braços',
  'Abdômen',
  'Pernas e glúteos',
  'Costas',
  'Peitoral',
  'Braços',
  'Pernas e glúteos',
  'Deltoides',
  'Multitrabalho',
  'Panturrilha',
];
/** Os mais pedidos de cada grupo entram antes; o resto segue a ordem do catálogo. */
const PRIMEIROS = (
  'B003 B002 B001 B008 B004 B012 B020 B006 B005 B018 B017 B013 B037 B010 B014 B015 B016 ' +
  'A034 A023 A007 A050 A005 A011 A012 A033 A035 A028 A026 A051'
)
  .split(' ')
  .map((c) => `LD-${c}`);
const BANCOS = 'A042 A048 A046 A044 A043 A045 A047 A049 A054'.split(' ').map((c) => `LD-${c}`);
const SUPORTE_ANILHAS = 'LD-A056';
const SUPORTE_BARRAS = 'LD-A053';
const ehBateria = (code: string) => P.get(code)!.linha === 'Bateria de pesos';

/** Escolhe `n` equipamentos equilibrando os grupos musculares conforme o perfil. */
function escolher(perfil: Perfil, n: number): string[] {
  const ordem = (c: string) => {
    const k = PRIMEIROS.indexOf(c);
    return k < 0 ? 999 : k;
  };
  const maquinas = dados.produtos
    .filter((p) => p.grupo !== 'Acessórios')
    .sort((a, b) => ordem(a.code) - ordem(b.code));
  const lista: string[] = [];
  const usos = new Map<string, number>();
  const por = (code: string) => {
    if (!P.has(code) || lista.length >= n) return;
    lista.push(code);
    usos.set(code, (usos.get(code) ?? 0) + 1);
  };
  por(SUPORTE_ANILHAS);
  const nBancos = Math.max(1, Math.round(n * perfil.bancos));
  const bancos = BANCOS.filter((c) => P.has(c));
  for (let k = 0; k < nBancos && bancos.length; k++) por(bancos[k % bancos.length]);
  if (n >= 16 && perfil.padrao.includes('L')) por(SUPORTE_BARRAS);
  if (n >= 30) por(SUPORTE_ANILHAS);
  for (let k = 0; lista.length < n && k < n * 20; k++) {
    const grupo = RODIZIO[k % RODIZIO.length];
    const quer = perfil.padrao[k % perfil.padrao.length];
    const doGrupo = maquinas.filter((p) => p.grupo === grupo);
    if (!doGrupo.length) continue;
    const menosUsado = (ps: ProdutoSim[]) =>
      ps.reduce<ProdutoSim | null>((m, p) => (!m || (usos.get(p.code) ?? 0) < (usos.get(m.code) ?? 0) ? p : m), null);
    const daLinha = menosUsado(doGrupo.filter((p) => (quer === 'B') === ehBateria(p.code)));
    const outra = menosUsado(doGrupo.filter((p) => (quer === 'B') !== ehBateria(p.code)));
    // Repetir máquina só quando o grupo inteiro já entrou uma vez.
    const pega = daLinha && ((usos.get(daLinha.code) ?? 0) === 0 || !outra || (usos.get(outra.code) ?? 0) > 0) ? daLinha : outra;
    if (pega) por(pega.code);
  }
  return lista;
}

/**
 * Posiciona a lista: bateria de pesos nas paredes olhando para o centro, peso
 * livre e bancos em ilhas no meio. Devolve o que coube e quantos sobraram.
 */
function posicionar(codes: string[]): { postos: Item[]; fora: number } {
  const { w, d } = estado;
  const AFASTA = 0.3;
  const CORREDOR = 1.2;
  const fixos = estado.obst.map((o) => ({ r: retObst(o), porta: o.t === 'porta' }));
  const postos: Item[] = [];
  const cabe = (it: Item, outros: Item[] = postos) => {
    const l = limites(retItem(it));
    if (l.x0 < -1e-6 || l.y0 < -1e-6 || l.x1 > w + 1e-6 || l.y1 > d + 1e-6) return false;
    // Dez centímetros de respiro em volta de pilar e área bloqueada; a faixa da porta fica inteira livre.
    if (fixos.some((f) => colide(retItem(it, f.porta ? 0 : 0.1), f.r))) return false;
    const r = retItem(it, FOLGA);
    return !outros.some((o) => o !== it && colide(r, retItem(o)));
  };
  const novo = (code: string): Item => ({ id: proximoId++, code, x: 0, y: 0, ang: 0 });

  // 1. Paredes. O ângulo é lado × 90: cima olha para baixo, direita para a esquerda e assim por diante.
  const ordemGrupo = (c: string) => {
    const k = RODIZIO.indexOf(P.get(c)!.grupo);
    return k < 0 ? 99 : k;
  };
  const deParede = codes.filter(ehBateria).sort((a, b) => ordemGrupo(a) - ordemGrupo(b));
  const doMeio = codes.filter((c) => !ehBateria(c));
  const porLado: Item[][] = [[], [], [], []];
  const sobra: string[] = [];
  const naParede = (it: Item, lado: number, t: number) => {
    const p = P.get(it.code)!;
    const fundo = AFASTA + p.c / 2;
    it.ang = lado * 90;
    if (lado === 0) [it.x, it.y] = [t, fundo];
    else if (lado === 2) [it.x, it.y] = [t, d - fundo];
    else if (lado === 3) [it.x, it.y] = [fundo, t];
    else [it.x, it.y] = [w - fundo, t];
  };
  // Cada máquina vai para a parede menos cheia, para as quatro ficarem equilibradas.
  // Nas laterais desconta os cantos, que as fileiras de cima e de baixo já ocupam.
  const util = (lado: number) => (lado % 2 ? Math.max(1, d - 5) : w);
  const usado = [0, 0, 0, 0];
  const encostar = (code: string): boolean => {
    const it = novo(code);
    const p = P.get(code)!;
    const ordem = [0, 2, 3, 1].sort((a, b) => usado[a] / util(a) - usado[b] / util(b));
    for (const lado of ordem) {
      const comp = lado % 2 ? d : w;
      for (let t = AFASTA + p.l / 2; t <= comp - AFASTA - p.l / 2 + 1e-6; t += 0.1) {
        naParede(it, lado, t);
        if (!cabe(it)) continue;
        usado[lado] += p.l + FOLGA;
        porLado[lado].push(it);
        postos.push(it);
        return true;
      }
    }
    return false;
  };
  const centralizar = () =>
    porLado.forEach((fila, lado) => {
      if (!fila.length) return;
      const eixo = lado % 2 ? 'y' : 'x';
      const comp = lado % 2 ? d : w;
      const lims = fila.map((it) => limites(retItem(it)));
      const ini = Math.min(...lims.map((l) => (eixo === 'x' ? l.x0 : l.y0)));
      const fim = Math.max(...lims.map((l) => (eixo === 'x' ? l.x1 : l.y1)));
      for (const fator of [0.5, 0.25]) {
        const desloca = grade((comp - fim - ini) * fator);
        if (Math.abs(desloca) < 0.05) return;
        fila.forEach((it) => (it[eixo] += desloca));
        const resto = postos.filter((o) => !fila.includes(o));
        if (fila.every((it) => cabe(it, resto))) return;
        fila.forEach((it) => (it[eixo] -= desloca));
      }
    });
  for (const code of deParede) if (!encostar(code)) sobra.push(code);
  centralizar();

  // 2. Ilhas no meio: fileiras em pares de costas uma para a outra, com corredor entre os pares.
  const fundoDe = (lado: number) =>
    porLado[lado].reduce((m, it) => {
      const l = limites(retItem(it));
      return Math.max(m, lado === 0 ? l.y1 : lado === 2 ? d - l.y0 : lado === 3 ? l.x1 : w - l.x0);
    }, 0);
  const recuo = (lado: number) => (porLado[lado].length ? fundoDe(lado) + CORREDOR : FOLGA);
  const ix0 = recuo(3);
  const ix1 = w - recuo(1);
  const iy0 = recuo(0);
  const iy1 = d - recuo(2);
  const fila: string[] = [...doMeio, ...sobra];
  const fileiras: { codes: string[]; larg: number; alt: number }[] = [];
  const semLugar: string[] = [];
  let atual: { codes: string[]; larg: number; alt: number } | null = null;
  for (const code of fila) {
    const p = P.get(code)!;
    if (p.l > ix1 - ix0 || p.c > iy1 - iy0) {
      semLugar.push(code);
      continue;
    }
    if (!atual || atual.larg + FOLGA + p.l > ix1 - ix0) {
      atual = { codes: [], larg: 0, alt: 0 };
      fileiras.push(atual);
    }
    atual.larg += (atual.codes.length ? FOLGA : 0) + p.l;
    atual.alt = Math.max(atual.alt, p.c);
    atual.codes.push(code);
  }
  // Quantas fileiras cabem na altura livre.
  const vao = (k: number) => (k % 2 ? FOLGA : CORREDOR);
  let usadas = 0;
  let altura = 0;
  for (let k = 0; k < fileiras.length; k++) {
    const mais = (k ? vao(k) : 0) + fileiras[k].alt;
    if (altura + mais > iy1 - iy0 + 1e-6) break;
    altura += mais;
    usadas = k + 1;
  }
  fileiras.slice(usadas).forEach((f) => semLugar.push(...f.codes));
  let y = iy0 + (iy1 - iy0 - altura) / 2;
  for (let k = 0; k < usadas; k++) {
    const f = fileiras[k];
    if (k) y += vao(k);
    let x = ix0 + (ix1 - ix0 - f.larg) / 2;
    for (const code of f.codes) {
      const p = P.get(code)!;
      const it = novo(code);
      // Fileira par olha para cima (costas embaixo); a ímpar olha para baixo.
      it.ang = k % 2 ? 0 : 180;
      it.x = grade(x + p.l / 2);
      it.y = grade(k % 2 ? y + p.c / 2 : y + f.alt - p.c / 2);
      x += p.l + FOLGA;
      if (cabe(it)) postos.push(it);
      else semLugar.push(code);
    }
    y += f.alt;
  }

  // 3. O que não entrou nas ilhas vai para o que sobrou de parede; em último caso, qualquer vaga livre.
  const semParede = semLugar.filter((code) => !encostar(code));
  centralizar();
  const passo = w * d > 400 ? 0.5 : 0.25;
  let fora = 0;
  for (const code of semParede) {
    const it = novo(code);
    let ok = false;
    for (const ang of [0, 90]) {
      it.ang = ang;
      const l = limites(retItem(it));
      const ex = (l.x1 - l.x0) / 2;
      const ey = (l.y1 - l.y0) / 2;
      for (let yy = ey + AFASTA; yy <= d - ey - AFASTA + 1e-6 && !ok; yy += passo)
        for (let xx = ex + AFASTA; xx <= w - ex - AFASTA + 1e-6 && !ok; xx += passo) {
          it.x = xx;
          it.y = yy;
          ok = cabe(it);
        }
      if (ok) break;
    }
    if (ok) postos.push(it);
    else fora++;
  }
  return { postos, fora };
}

function sugerir(perfilId: string) {
  const perfil = PERFIS[perfilId] ?? PERFIS.completa;
  if (estado.itens.length && !confirm(`Substituir os ${estado.itens.length} equipamentos do projeto atual pelo layout sugerido?`))
    return;
  const alvo = Math.max(3, Math.round(medir().sala / perfil.m2));
  // Mede a sala sem os equipamentos atuais: a área útil não depende deles.
  estado.itens = [];
  const { postos, fora } = posicionar(escolher(perfil, alvo));
  // Numeração da planta na ordem de leitura: de cima para baixo, da esquerda para a direita.
  estado.itens = postos.sort((a, b) => Math.round(a.y - b.y) || a.x - b.x);
  selecionar(null);
  mudou();
  avisar(
    `Layout "${perfil.nome}" com ${postos.length} equipamentos para ${fmt(medir().sala)} m².` +
      (fora ? ` ${fora} ${fora > 1 ? 'ficaram' : 'ficou'} de fora por falta de espaço.` : ' Coube tudo.') +
      ' Ajuste arrastando o que quiser.'
  );
}

// ── projetos salvos ─────────────────────────────────────────────────────────
function lerProjetos(): ProjetoSalvo[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_PROJETOS) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as ProjetoSalvo[]).filter((p) => p && typeof p.dados === 'string') : [];
  } catch {
    return [];
  }
}
function gravarProjetos(lista: ProjetoSalvo[]) {
  try {
    localStorage.setItem(CHAVE_PROJETOS, JSON.stringify(lista));
    return true;
  } catch {
    avisar('Não foi possível salvar neste navegador. Use "Copiar link do projeto" para guardar.');
    return false;
  }
}
const novoIdProjeto = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
function salvarProjeto() {
  const nome = estado.nome.trim() || 'Projeto sem nome';
  estado.nome = nome;
  ($('nome') as HTMLInputElement).value = nome;
  const lista = lerProjetos();
  const ja = lista.find((p) => p.nome.toLowerCase() === nome.toLowerCase());
  const reg: ProjetoSalvo = { id: ja?.id ?? novoIdProjeto(), nome, dados: codificar(estado), em: new Date().toISOString() };
  if (!gravarProjetos([reg, ...lista.filter((p) => p !== ja)])) return;
  salvar();
  resumo();
  listarProjetos();
  avisar(ja ? `Projeto "${nome}" atualizado.` : `Projeto "${nome}" salvo neste navegador.`);
}
function listarProjetos() {
  const lista = lerProjetos();
  $('n-projetos').textContent = String(lista.length);
  const ul = $('projetos');
  if (!lista.length) {
    const li = document.createElement('li');
    li.className = 'vazio';
    li.textContent = 'Nenhum projeto salvo ainda. Dê um nome e toque em Salvar.';
    ul.replaceChildren(li);
    return;
  }
  const botao = (rotulo: string, nome: string, fn: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip sm';
    b.textContent = rotulo;
    b.setAttribute('aria-label', `${rotulo} o projeto ${nome}`);
    b.onclick = fn;
    return b;
  };
  ul.replaceChildren(
    ...lista.map((p) => {
      const li = document.createElement('li');
      const e = decodificar(p.dados);
      const info = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = p.nome;
      const s = document.createElement('small');
      const data = new Date(p.em);
      s.textContent = `${e ? `${fmt(e.w, 1)} × ${fmt(e.d, 1)} m · ${e.itens.length} equip. · ` : ''}${Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR')}`;
      info.append(b, s);
      const acoes = document.createElement('div');
      acoes.className = 'pa';
      acoes.append(
        botao('Abrir', p.nome, () => {
          const aberto = decodificar(p.dados);
          if (!aberto) return avisar('Este projeto salvo está corrompido e não pôde ser aberto.');
          const atual = codificar(estado);
          const guardado = lerProjetos().some((x) => x.dados === atual);
          if (estado.itens.length && !guardado && !confirm('O projeto atual tem alterações que não foram salvas. Abrir o outro mesmo assim?'))
            return;
          aberto.nome = p.nome;
          carregar(aberto);
          avisar(`Projeto "${p.nome}" aberto.`);
        }),
        botao('Duplicar', p.nome, () => {
          const nomes = new Set(lerProjetos().map((x) => x.nome));
          let nome = `${p.nome} (cópia)`;
          for (let k = 2; nomes.has(nome); k++) nome = `${p.nome} (cópia ${k})`;
          const copia = decodificar(p.dados);
          if (copia) copia.nome = nome.slice(0, 40);
          gravarProjetos([
            ...lerProjetos(),
            { id: novoIdProjeto(), nome: nome.slice(0, 40), dados: copia ? codificar(copia) : p.dados, em: new Date().toISOString() },
          ]);
          listarProjetos();
        }),
        botao('Excluir', p.nome, () => {
          if (!confirm(`Excluir o projeto salvo "${p.nome}"? O que está na tela continua como está.`)) return;
          gravarProjetos(lerProjetos().filter((x) => x.id !== p.id));
          listarProjetos();
        })
      );
      li.append(info, acoes);
      return li;
    })
  );
}

// ── exportar: PDF (impressão) e PNG ─────────────────────────────────────────
const nomeDoProjeto = () => estado.nome.trim() || 'sem nome';
async function plantaLimpa(uid: string): Promise<SVGSVGElement> {
  await Promise.all([...new Set(estado.itens.map((i) => i.code))].map(pedirSilhueta));
  const s = document.createElementNS(NS, 'svg') as SVGSVGElement;
  s.setAttribute('xmlns', NS);
  pintar(s, uid, true);
  return s;
}
/** Monta a folha de impressão (A4 paisagem) com planta, legenda, resumo e contato. */
async function prepararFolha() {
  const { w, d, itens, obst } = estado;
  const m = medir();
  $('f-nome').textContent = nomeDoProjeto();
  $('f-data').textContent = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  $('f-planta').replaceChildren(await plantaLimpa('folha'));
  const linhas: [string, string][] = [
    ['Sala', `${fmt(w, 1)} × ${fmt(d, 1)} m (${fmt(m.sala)} m²)`],
    ['Equipamentos', String(itens.length)],
    ['Área ocupada', `${fmt(m.ocup)} m²`],
    ['Circulação livre', `${fmt(Math.max(0, m.livre))} m²`],
  ];
  if (obst.length) linhas.push(['Obstáculos', String(obst.length)]);
  $('f-resumo').replaceChildren(
    ...linhas.map(([t, v]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = t;
      const dd = document.createElement('dd');
      dd.textContent = v;
      div.append(dt, dd);
      return div;
    })
  );
  const ol = $('f-legenda');
  // Legenda: uma coluna até 22 itens, duas até 44, três até 80; acima disso vai para a segunda página.
  ol.dataset.tam = itens.length > 44 ? 'p' : itens.length > 22 ? 'm' : 'g';
  $('folha').dataset.tam = ol.dataset.tam;
  $('folha').toggleAttribute('data-longa', itens.length > 80);
  ol.replaceChildren(
    ...itens.map((i, k) => {
      const li = document.createElement('li');
      const p = P.get(i.code)!;
      li.innerHTML = `<span>${k + 1}</span><small>${i.code}</small><b></b>`;
      li.querySelector('b')!.textContent = p.nome;
      return li;
    })
  );
}
async function baixarPng() {
  const s = await plantaLimpa('png');
  const { w, d } = estado;
  const L = 2200;
  const A = Math.round((L * (d + 1.8)) / (w + 1.8));
  s.setAttribute('width', String(L));
  s.setAttribute('height', String(A));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(s)], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok();
      img.onerror = () => erro(new Error('svg'));
      img.src = url;
    });
    const TOPO = 120;
    const cv = document.createElement('canvas');
    cv.width = L;
    cv.height = A + TOPO;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#fff';
    c.fillRect(0, 0, cv.width, cv.height);
    c.drawImage(img, 0, TOPO, L, A);
    c.fillStyle = '#141413';
    c.font = '700 54px "Barlow Condensed", Barlow, Arial, sans-serif';
    c.textBaseline = 'middle';
    c.fillText(`LUDUS EQUIPAMENTOS · PROJETO ${nomeDoProjeto().toUpperCase()}`, 60, 52, L - 120);
    c.fillStyle = '#6d6a63';
    c.font = '500 28px Barlow, Arial, sans-serif';
    c.fillText(
      `Sala ${fmt(w, 1)} × ${fmt(d, 1)} m · ${estado.itens.length} equipamentos · ${new Date().toLocaleDateString('pt-BR')}`,
      60,
      98,
      L - 120
    );
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
    if (!blob) throw new Error('png');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `planta-ludus-${nomeDoProjeto().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projeto'}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    avisar('Imagem da planta baixada.');
  } catch {
    avisar('Não foi possível gerar a imagem neste navegador. Tente o PDF.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── controles ───────────────────────────────────────────────────────────────
$('q').addEventListener('input', listar);
document.querySelectorAll<HTMLButtonElement>('#linhas .chip').forEach((c) =>
  c.addEventListener('click', () => {
    filtroLinha = c.dataset.v!;
    document
      .querySelectorAll('#linhas .chip')
      .forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
    listar();
  })
);
document
  .querySelectorAll<HTMLButtonElement>('[data-modo]')
  .forEach((b) => b.addEventListener('click', () => trocarModo(b.dataset.modo as 'planta' | '3d')));
document
  .querySelectorAll<HTMLButtonElement>('[data-obst]')
  .forEach((b) => b.addEventListener('click', () => adicionarObst(b.dataset.obst as TipoObst)));
const larg = $('larg') as HTMLInputElement;
const prof = $('prof') as HTMLInputElement;
const nomeCampo = $('nome') as HTMLInputElement;
const lerNumero = (campo: HTMLInputElement, padrao: number) => parseFloat(campo.value.replace(',', '.')) || padrao;
const medidas = () => {
  estado.w = limitar(lerNumero(larg, estado.w), 3, 60);
  estado.d = limitar(lerNumero(prof, estado.d), 3, 60);
  estado.obst.forEach(prenderObst);
  estado.itens.forEach(prender);
  const id = selecionado;
  mudou();
  selecionar(id);
};
larg.addEventListener('change', medidas);
prof.addEventListener('change', medidas);
nomeCampo.addEventListener('input', () => {
  estado.nome = nomeCampo.value.slice(0, 40);
  salvar();
});
nomeCampo.addEventListener('change', resumo);
$('b-salvar').addEventListener('click', salvarProjeto);
const medidasObst = () => {
  const o = obstSel();
  if (!o) return;
  o.w = lerNumero($('o-larg') as HTMLInputElement, o.w);
  if (o.t !== 'porta') o.h = lerNumero($('o-prof') as HTMLInputElement, o.h);
  prenderObst(o);
  depois(o.id);
};
$('o-larg').addEventListener('change', medidasObst);
$('o-prof').addEventListener('change', medidasObst);
$('b-girar').addEventListener('click', () => girarSel(90));
$('b-girar-menos').addEventListener('click', () => girarSel(-15));
$('b-girar-mais').addEventListener('click', () => girarSel(15));
$('b-rem').addEventListener('click', removerSel);
$('b-rem-obst').addEventListener('click', removerSel);
$('b-dup').addEventListener('click', duplicarSel);
$('b-kit').addEventListener('click', () => {
  if (estado.itens.length && !confirm('Trocar o projeto atual pelo Kit Studio de 150 m²?')) return;
  carregar(doKit(dados.kits[0]));
});
$('b-limpar').addEventListener('click', () => {
  const tem = estado.itens.length + estado.obst.length;
  if (tem && !confirm('Remover todos os equipamentos e obstáculos da planta?')) return;
  estado.itens = [];
  estado.obst = [];
  selecionar(null);
  mudou();
});
$('b-link').addEventListener('click', async () => {
  const b = $('b-link');
  try {
    await navigator.clipboard.writeText(linkDoProjeto());
    b.textContent = 'Link copiado';
  } catch {
    prompt('Copie o link do projeto:', linkDoProjeto());
  }
  setTimeout(() => (b.textContent = 'Copiar link do projeto'), 2000);
});
const dlgSug = $('dlg-sug') as HTMLDialogElement;
$('b-sug').addEventListener('click', () => {
  $('sug-area').textContent = `${fmt(estado.w, 1)} × ${fmt(estado.d, 1)} m, ${fmt(medir().sala)} m²`;
  dlgSug.showModal();
});
$('sug-cancelar').addEventListener('click', () => dlgSug.close());
$('form-sug').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const perfil = new FormData(ev.target as HTMLFormElement).get('perfil');
  dlgSug.close();
  sugerir(String(perfil ?? 'completa'));
});
$('b-pdf').addEventListener('click', async () => {
  await prepararFolha();
  window.print();
});
window.addEventListener('beforeprint', () => void prepararFolha());
$('b-png').addEventListener('click', () => void baixarPng());

function carregar(e: Estado) {
  estado = e;
  estado.obst.forEach(prenderObst);
  larg.value = String(e.w);
  prof.value = String(e.d);
  nomeCampo.value = e.nome;
  selecionar(null);
  mudou();
}

// ── início: link compartilhado > kit pedido > projeto salvo ─────────────────
const params = new URLSearchParams(location.search);
const doHash = location.hash.startsWith('#p=') ? decodificar(location.hash.slice(3)) : null;
const kit = dados.kits.find((k) => k.id === params.get('kit'));
let salvo: Estado | null = null;
try {
  const s = localStorage.getItem(CHAVE);
  salvo = s ? decodificar(s) : null;
} catch {
  salvo = null;
}
listar();
listarProjetos();
carregar(doHash ?? (kit ? doKit(kit) : salvo) ?? estado);
const add = params.get('add');
if (add && P.has(add)) adicionar(add);
if (params.size || location.hash) history.replaceState(null, '', location.pathname);
