import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const products = JSON.parse(readFileSync(new URL('../src/data/core.json', import.meta.url), 'utf8'));
const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');

test('publishes all 66 national products at permanent Core URLs without commercial data', () => {
  assert.equal(products.length, 66);
  assert.equal(new Set(products.map((p) => p.code)).size, 66);
  assert.equal(new Set(products.map((p) => p.grupo_muscular)).size, 7);
  const folders = readdirSync(new URL('../dist/core/', import.meta.url), { withFileTypes: true }).filter((f) => f.isDirectory());
  assert.equal(folders.length, 66);
  const listing = read('loja/core/index.html');
  const sitemap = read('sitemap-0.xml');
  for (const p of products) {
    assert.equal(p.slug, p.code.toLowerCase());
    assert.ok(p.dim.every((n) => Number.isInteger(n) && n > 0));
    const path = `/core/${p.slug}/`;
    assert.ok(listing.includes(`href="${path}"`), p.code);
    assert.ok(sitemap.includes(`https://ludusequipamentos.com${path}`), p.code);
    const page = read(`core/${p.slug}/index.html`);
    assert.ok(page.includes(`href="https://ludusequipamentos.com${path}"`), p.code);
    assert.ok(page.includes(`data-code="${p.code}"`), p.code);
    assert.match(page, /"brand":\{"@type":"Brand","name":"Ludus Core"\}/);
    assert.match(page, /wa\.me\/5517996495696/);
    assert.ok(page.includes(encodeURIComponent(p.code)));
    assert.match(page, /<img[^>]+src="[^\"]+"/);
    for (const dimension of p.dim) assert.ok(page.includes(`${dimension} mm`), p.code);
    assert.doesNotMatch(page, /R\$|NF CHEIA|"offers"|"price"|Cores disponíveis|60 cm|\/simulador\/\?add=/i);
    assert.match(page, /Vista superior esquemática/);
    assert.doesNotMatch(page, /naciona(?:l|is)/i);
    assert.match(page, /ludus-core[^"']*\.png/);
    assert.equal(Object.hasOwn(p, 'price'), false);
  }
});

test('exposes Core from the home and keeps the original Premium catalog independent', () => {
  assert.match(read('index.html'), /href="\/loja\/core\/"/);
  assert.match(read('loja/premium/index.html'), /Ludus Premium/);
  assert.match(read('loja/premium/index.html'), /Linha Premium/);
  assert.doesNotMatch(read('loja/core/index.html'), /naciona(?:l|is)/i);
  assert.match(read('loja/core/index.html'), /alt="Ludus Core"/);
  assert.doesNotMatch(read('loja/premium/index.html'), /data-colecao="core"/);
  assert.match(read('core/ld-wh001/index.html'), /900 mm/);
  assert.match(read('core/ld-wh001/index.html'), /1,20 m²/);
  assert.match(read('core/ld-wh024/index.html'), /200 kg/);
});
