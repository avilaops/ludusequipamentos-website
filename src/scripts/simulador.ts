/**
 * Simulador "Monte sua academia": planta em escala com arrastar, girar e
 * checagem de sobreposição, mais a visão 3D da sala montada.
 *
 * Coordenadas da planta em metros: origem no canto superior esquerdo da sala,
 * x para a direita, y para baixo. A frente do equipamento aponta para baixo
 * quando rot = 0; cada unidade de rot é um quarto de volta no sentido horário.
 */
interface ProdutoSim {
  code: string;
  nome: string;
  linha: string;
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
  rot: number;
}
interface Estado {
  w: number;
  d: number;
  itens: Item[];
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

const dados = JSON.parse(document.getElementById('dados')!.textContent!) as {
  produtos: ProdutoSim[];
  kits: Kit[];
  folga: number;
  whatsapp: string;
};
const P = new Map(dados.produtos.map((p) => [p.code, p]));
const FOLGA = dados.folga;
const CHAVE = 'ludus-simulador-v1';
const NS = 'http://www.w3.org/2000/svg';

const silhuetaUrls = import.meta.glob<string>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/models/*/footprint.json',
  { eager: true, query: '?url', import: 'default' }
);
const specLoaders = import.meta.glob<Record<string, unknown>>(
  '/node_modules/@avilaops/gerador-3d/catalogs/ludus/specs/*.json',
  { import: 'default' }
);
const silhuetas = new Map<string, Silhueta>();
const pedindo = new Set<string>();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const svg = document.getElementById('planta') as unknown as SVGSVGElement;
const fmt = (n: number, d = 0) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

let estado: Estado = { w: 15, d: 10, itens: [] };
let proximoId = 1;
let selecionado: number | null = null;
let modo: 'planta' | '3d' = 'planta';

// ── estado: URL, armazenamento local e link compartilhável ──────────────────
const codificar = (e: Estado) =>
  btoa(JSON.stringify([e.w, e.d, e.itens.map((i) => [i.code, +i.x.toFixed(2), +i.y.toFixed(2), i.rot])]))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
function decodificar(s: string): Estado | null {
  try {
    const [w, d, itens] = JSON.parse(atob(s.replace(/-/g, '+').replace(/_/g, '/')));
    return {
      w,
      d,
      itens: (itens as [string, number, number, number][])
        .filter(([c]) => P.has(c))
        .map(([code, x, y, rot]) => ({ id: proximoId++, code, x, y, rot })),
    };
  } catch {
    return null;
  }
}
const doKit = (k: Kit): Estado => ({
  w: k.largura,
  d: k.profundidade,
  itens: k.itens.map((i) => ({ ...i, id: proximoId++ })),
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
/** Largura e profundidade ocupadas na planta, já com o giro. */
function caixa(i: Item): { w: number; h: number } {
  const p = P.get(i.code)!;
  return i.rot % 2 ? { w: p.c, h: p.l } : { w: p.l, h: p.c };
}
const sobrepoe = (a: Item, b: Item, margem = 0) => {
  const A = caixa(a);
  const B = caixa(b);
  return (
    Math.abs(a.x - b.x) < (A.w + B.w) / 2 + margem - 1e-6 && Math.abs(a.y - b.y) < (A.h + B.h) / 2 + margem - 1e-6
  );
};
function prender(i: Item) {
  const { w, h } = caixa(i);
  i.x = Math.min(Math.max(i.x, w / 2), Math.max(w / 2, estado.w - w / 2));
  i.y = Math.min(Math.max(i.y, h / 2), Math.max(h / 2, estado.d - h / 2));
}
const foraDaSala = (i: Item) => {
  const { w, h } = caixa(i);
  return w > estado.w + 1e-6 || h > estado.d + 1e-6;
};
/** Primeiro lugar livre varrendo a sala (com meia folga entre as máquinas). */
function lugarLivre(novo: Item) {
  const { w, h } = caixa(novo);
  for (let y = h / 2 + 0.3; y <= estado.d - h / 2 - 0.3 + 1e-6; y += 0.25) {
    for (let x = w / 2 + 0.3; x <= estado.w - w / 2 - 0.3 + 1e-6; x += 0.25) {
      novo.x = x;
      novo.y = y;
      if (!estado.itens.some((o) => sobrepoe(novo, o, FOLGA))) return;
    }
  }
  novo.x = estado.w / 2;
  novo.y = estado.d / 2;
}
const girar = ([px, pz]: [number, number], rot: number): [number, number] => {
  const r = ((rot % 4) + 4) % 4;
  return r === 0 ? [px, pz] : r === 1 ? [-pz, px] : r === 2 ? [-px, -pz] : [pz, -px];
};

async function pedirSilhueta(code: string) {
  if (silhuetas.has(code) || pedindo.has(code)) return;
  pedindo.add(code);
  const url = Object.entries(silhuetaUrls).find(([k]) => k.includes(`/${code}/`))?.[1];
  if (!url) return;
  try {
    silhuetas.set(code, await (await fetch(url)).json());
    if (modo === 'planta') desenhar();
  } catch {
    /* sem a silhueta, fica o retângulo */
  }
}

// ── planta ──────────────────────────────────────────────────────────────────
const el = (tag: string, attrs: Record<string, string | number>, pai?: Element) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  pai?.appendChild(e);
  return e;
};

function desenhar() {
  const { w, d } = estado;
  svg.setAttribute('viewBox', `-0.9 -0.9 ${w + 1.8} ${d + 1.8}`);
  svg.replaceChildren();
  el('rect', { class: 'parede', x: -0.14, y: -0.14, width: w + 0.28, height: d + 0.28 }, svg);
  el('rect', { class: 'piso', x: 0, y: 0, width: w, height: d }, svg);
  for (let x = 1; x < w; x++) el('line', { class: 'grade', x1: x, y1: 0, x2: x, y2: d }, svg);
  for (let y = 1; y < d; y++) el('line', { class: 'grade', x1: 0, y1: y, x2: w, y2: y }, svg);
  el('text', { class: 'cota', x: w / 2, y: -0.38 }, svg).textContent = `${fmt(w, 1)} m`;
  const cy = el('text', { class: 'cota', x: -0.42, y: d / 2, transform: `rotate(-90 -0.42 ${d / 2})` }, svg);
  cy.textContent = `${fmt(d, 1)} m`;

  // Áreas de treino primeiro, para as máquinas ficarem por cima.
  for (const i of estado.itens) {
    const c = caixa(i);
    const x0 = Math.max(0, i.x - c.w / 2 - FOLGA);
    const y0 = Math.max(0, i.y - c.h / 2 - FOLGA);
    el(
      'rect',
      {
        class: 'zona',
        'data-zona': i.id,
        x: x0,
        y: y0,
        width: Math.max(0, Math.min(w, i.x + c.w / 2 + FOLGA) - x0),
        height: Math.max(0, Math.min(d, i.y + c.h / 2 + FOLGA) - y0),
      },
      svg
    );
  }
  estado.itens.forEach((i, k) => {
    const c = caixa(i);
    const ruim = foraDaSala(i) || estado.itens.some((o) => o !== i && sobrepoe(i, o));
    const g = el(
      'g',
      {
        class: `item${ruim ? ' ruim' : ''}${i.id === selecionado ? ' sel' : ''}`,
        'data-id': i.id,
        transform: `translate(${i.x} ${i.y})`,
        tabindex: 0,
        role: 'button',
        'aria-label': `${k + 1}. ${P.get(i.code)!.nome}`,
      },
      svg
    );
    el('rect', { class: 'corpo', x: -c.w / 2, y: -c.h / 2, width: c.w, height: c.h, rx: 0.04 }, g);
    const s = silhuetas.get(i.code);
    if (s) {
      for (const part of s.parts)
        el('polygon', { points: part.map((p) => girar(p, i.rot).map((v) => v.toFixed(3)).join(',')).join(' ') }, g);
    } else {
      el('rect', { class: 'bloco', x: -c.w / 2, y: -c.h / 2, width: c.w, height: c.h, opacity: 0.35 }, g);
      pedirSilhueta(i.code);
    }
    el('circle', { class: 'dot', cx: 0, cy: 0, r: 0.23 }, g);
    el('text', { class: 'n', x: 0, y: 0, 'dominant-baseline': 'central' }, g).textContent = String(k + 1);
  });
  resumo();
}

function resumo() {
  const { w, d, itens } = estado;
  const sala = w * d;
  const ocup = itens.reduce((a, i) => a + caixa(i).w * caixa(i).h, 0);
  // União das áreas de treino numa grade de 10 cm.
  const g = 0.1;
  let treino = 0;
  if (itens.length) {
    const caixas = itens.map((i) => {
      const c = caixa(i);
      return [i.x - c.w / 2 - FOLGA, i.x + c.w / 2 + FOLGA, i.y - c.h / 2 - FOLGA, i.y + c.h / 2 + FOLGA];
    });
    for (let x = g / 2; x < w; x += g)
      for (let y = g / 2; y < d; y += g)
        if (caixas.some(([a, b, c, e]) => x >= a && x <= b && y >= c && y <= e)) treino += g * g;
  }
  $('r-n').textContent = String(itens.length);
  $('r-sala').textContent = `${fmt(sala)} m²`;
  $('r-ocup').textContent = `${fmt(ocup)} m²`;
  $('r-livre').textContent = `${fmt(Math.max(0, sala - treino))} m²`;

  const batendo = itens.filter((i) => itens.some((o) => o !== i && sobrepoe(i, o))).length;
  const grandes = itens.filter(foraDaSala).length;
  const aviso = $('aviso');
  aviso.hidden = !batendo && !grandes;
  aviso.textContent = [
    batendo ? `${batendo} equipamentos estão sobrepostos (em vermelho). Arraste para separar.` : '',
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
  $('dica').hidden = itens.length > 0 || modo === '3d';

  const contagem = new Map<string, number>();
  itens.forEach((i) => contagem.set(i.code, (contagem.get(i.code) ?? 0) + 1));
  const linhas = [...contagem].map(([c, n]) => `${n > 1 ? `${n}x ` : ''}${P.get(c)!.nome} (${c})`);
  const msg = itens.length
    ? `Olá! Montei minha academia no simulador da Ludus e quero um orçamento.\n\nSala: ${fmt(w, 1)} x ${fmt(d, 1)} m (${fmt(sala)} m²)\nEquipamentos (${itens.length}):\n- ${linhas.join('\n- ')}\n\nPlanta: ${linkDoProjeto()}`
    : 'Olá! Estou montando minha academia e quero ajuda da Ludus com o projeto.';
  ($('b-wa') as HTMLAnchorElement).href = `https://wa.me/${dados.whatsapp}?text=${encodeURIComponent(msg)}`;
}

function selecionar(id: number | null) {
  selecionado = id;
  const i = estado.itens.find((x) => x.id === id);
  $('sel').hidden = !i;
  if (i) {
    const p = P.get(i.code)!;
    $('sel-nome').textContent = `${p.nome} · ${i.code}`;
    ($('b-ver') as HTMLAnchorElement).href = `/loja/${p.slug}/`;
  }
  svg.querySelectorAll('.item').forEach((g) => g.classList.toggle('sel', Number(g.getAttribute('data-id')) === id));
}

function mudou() {
  salvar();
  if (modo === 'planta') desenhar();
  else montarCena();
}

function adicionar(code: string) {
  const novo: Item = { id: proximoId++, code, x: 0, y: 0, rot: 0 };
  lugarLivre(novo);
  estado.itens.push(novo);
  mudou();
  selecionar(novo.id);
}

// ── arrastar ────────────────────────────────────────────────────────────────
function ponto(ev: PointerEvent) {
  const m = svg.getScreenCTM()!.inverse();
  return new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m);
}
let arraste: { item: Item; dx: number; dy: number; g: SVGGElement } | null = null;
svg.addEventListener('pointerdown', (ev) => {
  const g = (ev.target as Element).closest<SVGGElement>('.item');
  if (!g) return selecionar(null);
  const item = estado.itens.find((i) => i.id === Number(g.dataset.id))!;
  selecionar(item.id);
  const p = ponto(ev);
  arraste = { item, dx: item.x - p.x, dy: item.y - p.y, g };
  svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener('pointermove', (ev) => {
  if (!arraste) return;
  const p = ponto(ev);
  const i = arraste.item;
  i.x = Math.round((p.x + arraste.dx) / 0.05) * 0.05;
  i.y = Math.round((p.y + arraste.dy) / 0.05) * 0.05;
  prender(i);
  arraste.g.setAttribute('transform', `translate(${i.x} ${i.y})`);
  const c = caixa(i);
  const z = svg.querySelector(`[data-zona="${i.id}"]`);
  const x0 = Math.max(0, i.x - c.w / 2 - FOLGA);
  const y0 = Math.max(0, i.y - c.h / 2 - FOLGA);
  z?.setAttribute('x', String(x0));
  z?.setAttribute('y', String(y0));
  z?.setAttribute('width', String(Math.max(0, Math.min(estado.w, i.x + c.w / 2 + FOLGA) - x0)));
  z?.setAttribute('height', String(Math.max(0, Math.min(estado.d, i.y + c.h / 2 + FOLGA) - y0)));
});
const soltar = () => {
  if (!arraste) return;
  arraste = null;
  const id = selecionado;
  mudou();
  selecionar(id);
};
svg.addEventListener('pointerup', soltar);
svg.addEventListener('pointercancel', soltar);
svg.addEventListener('keydown', (ev) => {
  const i = estado.itens.find((x) => x.id === selecionado);
  if (!i) return;
  const passo = ev.shiftKey ? 0.5 : 0.1;
  const mov: Record<string, [number, number]> = {
    ArrowLeft: [-passo, 0],
    ArrowRight: [passo, 0],
    ArrowUp: [0, -passo],
    ArrowDown: [0, passo],
  };
  if (mov[ev.key]) {
    i.x += mov[ev.key][0];
    i.y += mov[ev.key][1];
    prender(i);
  } else if (ev.key.toLowerCase() === 'r') i.rot = (i.rot + 1) % 4;
  else if (ev.key === 'Delete' || ev.key === 'Backspace') estado.itens = estado.itens.filter((x) => x !== i);
  else return;
  ev.preventDefault();
  const id = estado.itens.includes(i) ? i.id : null;
  mudou();
  selecionar(id);
});
svg.addEventListener('focusin', (ev) => {
  const g = (ev.target as Element).closest<SVGGElement>('.item');
  if (g && !arraste) selecionar(Number(g.dataset.id));
});

// ── cena 3D ─────────────────────────────────────────────────────────────────
let pararCena: (() => void) | null = null;
async function montarCena() {
  pararCena?.();
  const host = $('cena');
  host.replaceChildren();
  const aviso = document.createElement('p');
  aviso.style.cssText = 'padding:24px;color:#6d6a63;font-size:14px';
  aviso.textContent = 'Montando a sala em 3D…';
  host.append(aviso);

  const [THREE, { OrbitControls }, { RoomEnvironment }, { generateEquipment }] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('@avilaops/gerador-3d'),
  ]);
  if (modo !== '3d') return;
  const { w, d } = estado;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
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
  const R = Math.max(w, d);
  sol.position.set(-0.5 * R, 1.4 * R, 0.8 * R);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 0.1, far: 5 * R });
  sol.shadow.bias = -0.0005;
  scene.add(sol);

  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ color: '#3b3a37', roughness: 0.92, envMapIntensity: 0.2 })
  );
  piso.rotation.x = -Math.PI / 2;
  piso.receiveShadow = true;
  scene.add(piso);
  const parede = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.95, envMapIntensity: 0.2 });
  const alt = 2.7;
  for (const [sx, sz, px, pz] of [
    [w + 0.2, 0.1, 0, -d / 2 - 0.05],
    [0.1, d, -w / 2 - 0.05, 0],
  ] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, alt, sz), parede);
    m.position.set(px, alt / 2, pz);
    m.receiveShadow = true;
    scene.add(m);
  }

  const INTENS: Record<string, number> = { chrome: 1, upholstery: 0.18, rubber: 0.15, plate: 0.5 };
  const gerados: { dispose(): void }[] = [];
  for (const i of estado.itens) {
    const loader = Object.entries(specLoaders).find(([k]) => k.endsWith(`/${i.code}.json`))?.[1];
    if (!loader) continue;
    try {
      const eq = generateEquipment((await loader()) as never);
      if (modo !== '3d') return;
      eq.object.position.set(i.x - w / 2, 0, i.y - d / 2);
      eq.object.rotation.y = (-i.rot * Math.PI) / 2;
      eq.object.traverse((o) => {
        const mat = (o as unknown as { material?: { name: string; envMapIntensity?: number } }).material;
        if (mat && 'envMapIntensity' in mat) mat.envMapIntensity = INTENS[mat.name] ?? 0.4;
      });
      scene.add(eq.object);
      gerados.push(eq);
    } catch {
      /* um modelo com erro não derruba a sala */
    }
  }

  host.replaceChildren(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(38, 1.5, 0.1, 400);
  camera.position.set(0.42 * R, 0.62 * R, 0.82 * R);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.6, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 2;
  controls.maxDistance = 3 * R;
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
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
  pararCena = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    controls.dispose();
    gerados.forEach((g) => g.dispose());
    pmrem.dispose();
    renderer.dispose();
    pararCena = null;
  };
}

function trocarModo(novo: 'planta' | '3d') {
  modo = novo;
  document.querySelectorAll<HTMLButtonElement>('[data-modo]').forEach((b) => {
    const on = b.dataset.modo === novo;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  (svg as unknown as HTMLElement).style.display = novo === 'planta' ? '' : 'none';
  $('cena').hidden = novo !== '3d';
  if (novo === '3d') {
    selecionar(null);
    $('dica').hidden = true;
    montarCena();
  } else {
    pararCena?.();
    desenhar();
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
        b.onclick = () => {
          if (modo === '3d') trocarModo('planta');
          adicionar(p.code);
        };
        li.append(b);
        return li;
      })
  );
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
const larg = $('larg') as HTMLInputElement;
const prof = $('prof') as HTMLInputElement;
const medidas = () => {
  const w = Math.min(60, Math.max(3, parseFloat(larg.value.replace(',', '.')) || estado.w));
  const d = Math.min(60, Math.max(3, parseFloat(prof.value.replace(',', '.')) || estado.d));
  estado.w = w;
  estado.d = d;
  estado.itens.forEach(prender);
  mudou();
};
larg.addEventListener('change', medidas);
prof.addEventListener('change', medidas);
const comSelecionado = (fn: (i: Item) => void) => () => {
  const i = estado.itens.find((x) => x.id === selecionado);
  if (!i) return;
  fn(i);
  const id = estado.itens.includes(i) ? selecionado : null;
  mudou();
  selecionar(id);
};
$('b-girar').addEventListener(
  'click',
  comSelecionado((i) => {
    i.rot = (i.rot + 1) % 4;
    prender(i);
  })
);
$('b-rem').addEventListener(
  'click',
  comSelecionado((i) => {
    estado.itens = estado.itens.filter((x) => x !== i);
  })
);
$('b-dup').addEventListener('click', () => {
  const i = estado.itens.find((x) => x.id === selecionado);
  if (i) adicionar(i.code);
});
$('b-kit').addEventListener('click', () => {
  if (estado.itens.length && !confirm('Trocar o projeto atual pelo Kit Studio de 150 m²?')) return;
  carregar(doKit(dados.kits[0]));
});
$('b-limpar').addEventListener('click', () => {
  if (estado.itens.length && !confirm('Remover todos os equipamentos da planta?')) return;
  estado.itens = [];
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

function carregar(e: Estado) {
  estado = e;
  larg.value = String(e.w);
  prof.value = String(e.d);
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
carregar(doHash ?? (kit ? doKit(kit) : salvo) ?? estado);
const add = params.get('add');
if (add && P.has(add)) adicionar(add);
if (params.size || location.hash) history.replaceState(null, '', location.pathname);
