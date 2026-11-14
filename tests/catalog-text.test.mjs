import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { workerScript } from './helpers/catalog-worker.mjs';

const product = { code: 'LD-EX001', nome: 'Equipamento exemplo atual', colecao: 'core', grupo_muscular: 'Pernas', linha: 'Exemplo', dim: [1200, 1000, 900], descricao: 'Descrição atual publicada', peso: '', bateria: '', url: '/core/equipamento-exemplo/', imageKey: 'exemplo.webp' };
const publication = (products = [product], sequence = 1) => ({ id: '11111111-1111-4111-8111-111111111111', sequence, products });
const page = '<html><head><title>Anterior</title></head><body><main><h1 data-catalog-field="nome">Equipamento anterior</h1><p data-catalog-field="descricao">Descrição anterior</p><p data-catalog-field="dimensoes">100 × 100 × 100 mm</p></main></body></html>';

test('catálogo retirado não permanece disponível em Markdown ou MDX do Pages', async () => {
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], outboundService: request => new Response(request.url.endsWith('.mdx') || request.url.endsWith('.md') ? '# Equipamento anterior' : page, { headers: { 'Content-Type': request.url.endsWith('.mdx') ? 'text/mdx' : 'text/html' } }) });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/publications/current.json', JSON.stringify(publication([{ ...product, url: '/core/outro-exemplo/' }])));
    const send = path => mf.dispatchFetch('https://ludusequipamentos.com/core/equipamento-exemplo/' + path);
    assert.equal((await send('')).status, 404);
    assert.equal((await send('index.mdx')).status, 404);
    assert.equal((await send('index.md')).status, 404);
  } finally { await mf.dispose(); }
});

test('texto usa o HTML publicado atual e valida atualização e retirada antes do ETag', async () => {
  const outbound = [];
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], outboundService: request => {
    outbound.push(request);
    return new Response(page, { headers: { 'Content-Type': 'text/html', ETag: '"etag-do-html"' } });
  } });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    const publish = value => bucket.put('ludus/publications/current.json', JSON.stringify(value));
    await publish(publication());
    const send = (file, init) => mf.dispatchFetch('https://ludusequipamentos.com/core/equipamento-exemplo/' + file, init);
    const html = await send('');
    assert.match(await html.text(), /href="\/core\/equipamento-exemplo\/index\.mdx"/);
    const first = await send('index.mdx', { headers: { Cookie: 'privado=exemplo', Authorization: 'Bearer exemplo', Range: 'bytes=0-2', 'If-Modified-Since': 'Wed, 21 Oct 2015 07:28:00 GMT' } });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('content-type'), 'text/mdx; charset=utf-8');
    assert.equal(first.headers.get('x-robots-tag'), 'noindex');
    assert.match(await first.text(), /Equipamento exemplo atual/);
    const etag = first.headers.get('etag');
    assert.match(etag, /^"[a-f0-9]{64}"$/);
    const unchanged = await send('index.mdx', { headers: { 'If-None-Match': etag } });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), '');
    const head = await send('index.mdx', { method: 'HEAD' });
    assert.equal(head.headers.get('etag'), etag);
    assert.equal(await head.text(), '');
    await publish(publication([{ ...product, descricao: 'Descrição revisada • sem versão anterior', dim: [2200, 1800, 1500] }], 2));
    const updated = await send('index.mdx', { headers: { 'If-None-Match': etag } });
    assert.equal(updated.status, 200);
    assert.notEqual(updated.headers.get('etag'), etag);
    const text = await updated.text();
    assert.match(text, /Descrição revisada • sem versão anterior/);
    assert.match(text, /2200 × 1800 × 1500 mm/);
    assert.doesNotMatch(text, /Descrição anterior/);
    const md = await send('index.md');
    assert.equal(md.headers.get('content-type'), 'text/markdown; charset=utf-8');
    assert.notEqual(md.headers.get('etag'), updated.headers.get('etag'));
    await publish(publication([{ ...product, url: '/core/outro-exemplo/' }], 3));
    assert.equal((await send('index.mdx', { headers: { 'If-None-Match': updated.headers.get('etag') } })).status, 404);
    for (const request of outbound) {
      assert.equal(request.url, 'https://ludusequipamentos.pages.dev/core/equipamento-exemplo/');
      assert.equal(request.method, 'GET');
      for (const name of ['cookie', 'authorization', 'range', 'if-none-match', 'if-modified-since']) assert.equal(request.headers.get(name), null, name);
    }
  } finally { await mf.dispose(); }
});

test('texto respeita noindex, erros e redirects do HTML e o fallback público sem publicação', async () => {
  let mode = 'header';
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], outboundService: () => {
    if (mode === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://ludusequipamentos.pages.dev/loja/' } });
    if (mode === 'auth') return new Response('Negado', { status: 401 });
    if (mode === 'partial') return new Response('Parcial', { status: 206, headers: { 'Content-Type': 'text/html' } });
    if (mode === 'conditional') return new Response(null, { status: 304 });
    if (mode === 'not-html') return new Response('Não é página', { headers: { 'Content-Type': 'text/plain' } });
    const html = mode === 'meta' ? page.replace('<head>', '<head><meta name="robots" content="none">') : page;
    if (mode === 'large') return new Response('<html><body><main>' + 'x'.repeat(2_000_001) + '</main></body></html>', { headers: { 'Content-Type': 'text/html' } });
    return new Response(html, { headers: { 'Content-Type': 'text/html', ...(mode === 'header' ? { 'X-Robots-Tag': 'noindex' } : {}), ...(mode === 'cookie' ? { 'Set-Cookie': 'privado=exemplo' } : {}) } });
  } });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/publications/current.json', JSON.stringify(publication()));
    const send = () => mf.dispatchFetch('https://ludusequipamentos.com/core/equipamento-exemplo/index.mdx', { redirect: 'manual', headers: { 'If-None-Match': '*' } });
    assert.equal((await send()).status, 404);
    mode = 'meta'; assert.equal((await send()).status, 404);
    mode = 'auth'; assert.equal((await send()).status, 401);
    mode = 'partial'; assert.equal((await send()).status, 502);
    mode = 'conditional'; assert.equal((await send()).status, 502);
    mode = 'cookie'; assert.equal((await send()).status, 404);
    mode = 'large'; assert.equal((await send()).status, 413);
    mode = 'redirect'; const redirect = await send(); assert.equal(redirect.status, 302); assert.equal(redirect.headers.get('location'), 'https://ludusequipamentos.com/loja/');
    mode = 'not-html'; assert.equal((await send()).status, 404);
    mode = 'normal';
    await bucket.delete('ludus/publications/current.json');
    const fallback = await mf.dispatchFetch('https://ludusequipamentos.com/core/equipamento-exemplo/index.mdx');
    assert.equal(fallback.status, 200);
    assert.match(await fallback.text(), /Equipamento anterior/);
    await bucket.put('ludus/publications/current.json', 'invalid-json');
    assert.equal((await send()).status, 503);
  } finally { await mf.dispose(); }
});

test('texto rejeita query, host e caminhos não canônicos sem alcançar outro destino', async () => {
  let calls = 0;
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], outboundService: () => { calls++; return new Response(page, { headers: { 'Content-Type': 'text/html' } }); } });
  try {
    const send = (url, init) => mf.dispatchFetch(url, { redirect: 'manual', ...init });
    assert.equal((await send('https://ludusequipamentos.com/core/equipamento-exemplo/index.mdx?preview=1')).status, 400);
    assert.equal((await send('https://outro.example/core/equipamento-exemplo/index.mdx')).status, 421);
    assert.equal((await send('https://ludusequipamentos.com/core/%252fprivado/index.mdx')).status, 404);
    assert.equal((await send('https://ludusequipamentos.com/core/equipamento-exemplo/index.mdx', { method: 'POST' })).status, 405);
    assert.equal(calls, 0);
  } finally { await mf.dispose(); }
});

test('coleção textual acompanha os produtos e os links da publicação corrente', async () => {
  const collectionHtml = '<html><head><title>Coleção exemplo</title></head><body><main><h1>Coleção exemplo</h1><p data-catalog-count="all">999</p><div id="grade">Equipamento retirado</div></main></body></html>';
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], outboundService: () => new Response(collectionHtml, { headers: { 'Content-Type': 'text/html' } }) });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/publications/current.json', JSON.stringify(publication()));
    const response = await mf.dispatchFetch('https://ludusequipamentos.com/loja/core/index.md');
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /Equipamento exemplo atual/);
    assert.match(body, /https:\/\/ludusequipamentos.com\/core\/equipamento-exemplo\//);
    assert.doesNotMatch(body, /Equipamento retirado|999/);
  } finally { await mf.dispose(); }
});
