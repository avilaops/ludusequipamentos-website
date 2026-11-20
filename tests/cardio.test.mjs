import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
const products = JSON.parse(readFileSync(new URL('../src/data/cardio.json', import.meta.url), 'utf8'));

test('publishes the 28 Cardio products with a permanent page each, without commercial or supplier data', () => {
  assert.equal(products.length, 28);
  assert.equal(new Set(products.map((p) => p.code)).size, 28);
  assert.deepEqual(products.map((p) => p.code), Array.from({ length: 28 }, (_, i) => `LD-C${String(i + 1).padStart(3, '0')}`));
  const raw = JSON.stringify(products);
  assert.doesNotMatch(raw, /DHZ|valor|preco|preço|custo/i);
  for (const p of products) {
    assert.ok(existsSync(new URL(`../dist/cardio/${p.slug}/index.html`, import.meta.url)), p.code);
    const html = read(`cardio/${p.slug}/index.html`);
    assert.match(html, new RegExp(`${p.dim[2]} mm`));
    assert.match(html, /Linha Cardio/);
    assert.doesNotMatch(html, /DHZ/);
  }
});

test('the Cardio collection lists only its products, grouped by equipment type', () => {
  const html = read('loja/cardio/index.html');
  assert.equal((html.match(/data-colecao="cardio"/g) ?? []).length, 28);
  assert.equal((html.match(/data-colecao="(?:core|premium)"/g) ?? []).length, 0);
  assert.match(html, /data-v="Esteiras"/);
  assert.match(html, /data-v="Elípticos"/);
  assert.match(html, /Tipo de equipamento/);
  for (const match of html.matchAll(/class="card" href="([^"]+)"/g)) {
    assert.ok(existsSync(new URL(`../dist${match[1]}index.html`, import.meta.url)), match[1]);
  }
});

test('every line links to Cardio and the overview still opens with Core and Premium alternating', () => {
  for (const path of ['loja/index.html', 'loja/core/index.html', 'loja/premium/index.html', 'loja/cardio/index.html', 'index.html']) {
    assert.match(read(path), /href="\/loja\/cardio\/"/, path);
  }
  const all = read('loja/index.html');
  assert.equal((all.match(/data-colecao="cardio"/g) ?? []).length, 28);
  assert.equal((all.match(/data-colecao="premium"/g) ?? []).length, 91);
});

test('legacy /cardio/ forwards to the collection', () => {
  assert.match(read('cardio/index.html'), /location\.replace\('\/loja\/cardio\/' \+ location\.search \+ location\.hash\)/);
});

test('every Cardio product shows its processed photo from the site, never a broken path or a placeholder', async () => {
  const sharp = (await import('sharp')).default;
  const html = read('loja/cardio/index.html');
  assert.doesNotMatch(html, /Foto em breve/);
  assert.doesNotMatch(html, /src="\/midias\/produtos\/LD-C/);
  assert.equal((html.match(/src="\/fotos-cardio\/LD-C\d{3}\.webp"/g) ?? []).length, 28 + 1); // 28 cards + the featured product
  for (const p of products) {
    const file = new URL(`../dist/fotos-cardio/${p.code}.webp`, import.meta.url);
    assert.ok(existsSync(file), p.code);
    const meta = await sharp(file.pathname.replace(/^\/([A-Za-z]:)/, '$1')).metadata();
    assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1536, 1024], p.code);
    const ficha = read(`cardio/${p.slug}/index.html`);
    assert.match(ficha, new RegExp(`/fotos-cardio/${p.code}\\.webp`), p.code);
    assert.match(ficha, /property="og:image"/);
  }
  assert.doesNotMatch(html, /modelo 3D/i);
});

test('simulator offers all 28 Cardio products in plan and 3D, with their specs and silhouettes bundled', () => {
  const sim = read('simulador/index.html');
  assert.equal((sim.match(/<li data-code="LD-C\d{3}"/g) ?? []).length, 28);
  assert.match(sim, /data-v="Ludus Cardio"/);
  const assets = readdirSync(new URL('../dist/_astro/', import.meta.url));
  assert.equal(assets.filter((file) => /^LD-C\d{3}\./.test(file)).length, 28);
});
