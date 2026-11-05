import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../dist/${path}`, import.meta.url), 'utf8');
test('the store exposes both collections and each collection contains only its products', () => {
  for (const [path, premiumCount, coreCount] of [
    ['loja/index.html', 91, 66],
    ['loja/premium/index.html', 91, 0],
    ['loja/core/index.html', 0, 66],
  ]) {
    const html = read(path);
    assert.equal((html.match(/data-colecao="premium"/g) ?? []).length, premiumCount, path);
    assert.equal((html.match(/data-colecao="core"/g) ?? []).length, coreCount, path);
    assert.match(html, /aria-label="Selecionar linha de equipamentos"/);
    assert.match(html, /href="\/loja\/premium\/"/);
    assert.match(html, /href="\/loja\/core\/"/);
    for (const match of html.matchAll(/class="card" href="([^"]+)"/g)) {
      assert.ok(existsSync(new URL(`../dist${match[1]}index.html`, import.meta.url)), match[1]);
    }
  }
});

test('legacy Core collection forwards filters while permanent QR product pages remain available', () => {
  const legacy = read('core/index.html');
  assert.match(legacy, /location\.replace\('\/loja\/core\/' \+ location\.search \+ location\.hash\)/);
  assert.match(read('core/ld-wh001/index.html'), /900 mm/);
  assert.match(read('loja/hiperextensao-de-gluteos-de-peso-livre-ld-a001/index.html'), /LD-A001/);
});

test('home Core identity links to its collection without a duplicate text heading', () => {
  const home = read('index.html');
  assert.match(home, /<a href="\/loja\/core\/" aria-label="Explorar a Linha Core"[^>]*><img/);
  assert.doesNotMatch(home, /<h2[^>]*>Linha Core<\/h2>/);
  assert.match(home, /<dt\b[^>]*>157<\/dt>/);
  assert.match(home, /<dt\b[^>]*>2<\/dt>/);
});

test('collection pages share the catalog controls and the overview represents both lines immediately', () => {
  for (const path of ['loja/index.html', 'loja/core/index.html', 'loja/premium/index.html']) {
    const html = read(path);
    assert.match(html, /id="busca"/);
    assert.match(html, /id="limpar"/);
    assert.match(html, /id="grade"/);
    assert.doesNotMatch(html, /Seu treino\. Sua seleção\.|class="hero-foto/);
    assert.doesNotMatch(html, /data-v="(?:Deltoides|Multitrabalho|Abdômen)"/);
    const header = html.match(/<header\b[\s\S]*?<\/header>/)?.[0];
    assert.match(header, /alt="Ludus"/);
  }
  const cards = [...read('loja/index.html').matchAll(/data-colecao="(core|premium)"/g)];
  assert.deepEqual(cards.slice(0, 4).map((match) => match[1]), ['core', 'premium', 'core', 'premium']);
  assert.doesNotMatch(read('loja/index.html'), /data-filtro="linha"/);
  assert.match(read('loja/premium/index.html'), /data-filtro="linha"/);
  assert.match(read('loja/premium/index.html'), /href="\/catalogos\/ludus-premium.pdf"/);
});
