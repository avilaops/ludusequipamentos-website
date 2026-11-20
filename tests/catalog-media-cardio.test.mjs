import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { workerScript } from './helpers/catalog-worker.mjs';
import { validatePublication } from '../workers/catalog-media.mjs';

const coreKey = 'ludus/catalogo/v1/core/LD-WH001/web.webp';
const cardioKey = 'ludus/catalogo/v1/cardio/LD-C003/web.webp';
const manifest = {
  products: [
    { sku: 'LD-WH001', assets: [{ storage_key: coreKey, variant: 'webp' }] },
    { sku: 'LD-C003', assets: [{ storage_key: cardioKey, variant: 'webp' }] },
  ],
};
const core = { code: 'LD-WH001', nome: 'Agachamento Búlgaro', colecao: 'core', grupo_muscular: 'Pernas e glúteos', linha: 'Ludus Core', dim: [1200, 1000, 900], descricao: 'Core.', peso: '50 kg', bateria: '', url: '/core/ld-wh001/', imageKey: coreKey };
const cardio = { code: 'LD-C003', nome: 'Esteira Ergométrica PRO X8600', colecao: 'cardio', grupo_muscular: 'Esteiras', linha: 'Ludus Cardio', dim: [2180, 920, 1460], descricao: 'Cardio.', peso: '196 kg', bateria: '', url: '/cardio/ld-c003/', imageKey: cardioKey };
const publicacao = (products, sequence = 1) => ({ id: `${sequence}`.padStart(8, '0') + '-1111-4111-8111-111111111111', sequence, products });
const pagina = '<html><head><title>Antigo</title></head><body><h1 data-catalog-field="nome">Antigo</h1><span data-catalog-count="all">185</span><span data-catalog-count="core">66</span><span data-catalog-count="cardio">28</span><div id="grade"><a class="card" data-colecao="cardio" href="/cardio/ld-c003/">estático</a></div><div data-filtro="grupo"></div><span id="conta"></span></body></html>';

async function ambiente(run) {
  const token = 'test-only-not-a-real-credential-123456789';
  const mf = new Miniflare({ modules: true, script: workerScript, compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], bindings: { PUBLISH_TOKEN: token },
    outboundService: () => new Response(pagina, { headers: { 'Content-Type': 'text/html' } }) });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/catalogo/v1/manifest.json', JSON.stringify(manifest));
    await bucket.put(coreKey, 'core-image', { httpMetadata: { contentType: 'image/webp' } });
    await bucket.put(cardioKey, 'cardio-image', { httpMetadata: { contentType: 'image/webp' } });
    const send = (path, init) => mf.dispatchFetch('https://ludusequipamentos.com' + path, init);
    const publish = (body) => send('/midias/_publish', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    await run({ send, publish });
  } finally { await mf.dispose(); }
}

test('a publicação aceita a coleção e as URLs do Cardio e continua recusando o resto', () => {
  assert.equal(validatePublication(publicacao([cardio]), manifest).products[0].colecao, 'cardio');
  for (const patch of [{ colecao: 'outra' }, { url: '/outra/ld-c003/' }, { url: '//evil.test/' }]) {
    assert.throws(() => validatePublication(publicacao([{ ...cardio, ...patch }]), manifest), patch.colecao ?? patch.url);
  }
});

test('com o Cardio ainda fora da publicação, as páginas estáticas passam e os contadores ficam como no build', async () => {
  await ambiente(async ({ send, publish }) => {
    assert.equal((await publish(publicacao([core]))).status, 200);
    const colecao = await send('/loja/cardio/');
    assert.equal(colecao.status, 200);
    const html = await colecao.text();
    assert.match(html, /estático/); // o grid não foi esvaziado
    assert.match(html, /data-catalog-count="cardio">28</);
    assert.match(html, /data-catalog-count="all">185</); // a página do Cardio não é reescrita enquanto o Cardio não está publicado
    assert.equal((await send('/cardio/ld-c003/')).status, 200); // ficha estática passa
    assert.equal((await send('/loja/nao-existe/')).status, 404); // o bloqueio de fichas fora da publicação segue valendo
    const loja = await (await send('/loja/')).text();
    assert.match(loja, /data-catalog-count="core">1</); // Core e Premium continuam vindo da publicação
    assert.match(loja, /data-catalog-count="all">1</); // o total da visão geral continua vindo da publicação
    assert.match(loja, /data-catalog-count="cardio">28</); // e o do Cardio fica com o número do build
  });
});

test('com o Cardio publicado, o Worker renderiza a coleção, serve a foto e rotula a ficha', async () => {
  await ambiente(async ({ send, publish }) => {
    assert.equal((await publish(publicacao([core, cardio]))).status, 200);
    const colecao = await (await send('/loja/cardio/')).text();
    assert.match(colecao, /data-colecao="cardio"/);
    assert.match(colecao, /Linha Cardio/);
    assert.doesNotMatch(colecao, /estático/);
    assert.match(colecao, /data-catalog-count="cardio">1</);
    assert.match(colecao, /data-catalog-count="all">2</);
    const foto = await send('/midias/produtos/LD-C003');
    assert.equal(foto.status, 200);
    assert.equal(await foto.text(), 'cardio-image');
    const ficha = await (await send('/cardio/ld-c003/')).text();
    assert.match(ficha, /Esteira Ergométrica PRO X8600 LD-C003 · Ludus Cardio/);
    const visaoGeral = await (await send('/loja/')).text();
    assert.ok(visaoGeral.indexOf('data-colecao="core"') < visaoGeral.indexOf('data-colecao="cardio"'), 'Core antes do Cardio na visão geral');
  });
});
