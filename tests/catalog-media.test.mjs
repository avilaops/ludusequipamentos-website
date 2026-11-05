import test from 'node:test';
import assert from 'node:assert/strict';
import { Miniflare } from 'miniflare';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validatePublication } from '../workers/catalog-media.mjs';

const imageKey = 'ludus/catalogo/v1/core/LD-WH001/web.webp';
const sourceKey = 'ludus/catalogo/v1/core/LD-WH001/source.png';
const manifest = { products: [{ sku: 'LD-WH001', assets: [{ storage_key: imageKey, variant: 'webp' }, { storage_key: sourceKey, variant: 'source' }] }] };
const publication = () => ({ id: '11111111-1111-4111-8111-111111111111', sequence: 1, products: [{ code: 'LD-WH001', nome: 'Agachamento <teste>', colecao: 'core', grupo_muscular: 'Pernas e glúteos', linha: 'Articulado', dim: [1200, 1000, 900], descricao: 'Descrição', peso: '', bateria: '', url: '/core/ld-wh001/', imageKey, price: '999.99' }] });

test('publicação exclui preços e rejeita originais, SKU divergente e dimensões inválidas', () => {
  assert.equal('price' in validatePublication(publication(), manifest).products[0], false);
  for (const patch of [{ imageKey: sourceKey }, { code: 'LD-WH002' }, { dim: [0, 1000, 900] }, { url: '//evil.test/' }]) {
    const input = publication(); Object.assign(input.products[0], patch); assert.throws(() => validatePublication(input, manifest));
  }
  const duplicate = publication(); duplicate.products.push(duplicate.products[0]); assert.throws(() => validatePublication(duplicate, manifest));
});

test('Worker: R2 real local, original privado, publicação explícita, replay e HTML seguro', async () => {
  const token = 'test-only-not-a-real-credential-123456789';
  const mf = new Miniflare({ modules: true, scriptPath: fileURLToPath(new URL('../workers/catalog-media.mjs', import.meta.url)), compatibilityDate: '2026-07-30', r2Buckets: ['MEDIA'], bindings: { PUBLISH_TOKEN: token },
    outboundService: () => new Response('<html><head><title>Antigo</title></head><body><h1 data-catalog-field="nome">Antigo</h1><div id="grade"></div><div data-filtro="grupo"></div><span id="conta"></span></body></html>', { headers: { 'Content-Type': 'text/html' } }) });
  try {
    const bucket = await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/catalogo/v1/manifest.json', JSON.stringify(manifest));
    await bucket.put(imageKey, 'webp-image', { httpMetadata: { contentType: 'image/webp' } });
    await bucket.put(sourceKey, 'private-original', { httpMetadata: { contentType: 'image/png' } });
    for (const line of ['core','premium']) await bucket.put(`ludus/catalogos/comercial-2026-11-05/ludus-${line}.pdf`, '%PDF-test-catalog', {httpMetadata:{contentType:'application/pdf'}});
    const send = (path, init) => mf.dispatchFetch('https://ludusequipamentos.com'+path, init);
    for (const line of ['core','premium']) {
      const pdf=await send(`/catalogos/ludus-${line}.pdf`,{headers:{Range:'bytes=0-4'}});
      assert.equal(pdf.status,206);assert.equal(pdf.headers.get('Content-Type'),'application/pdf');assert.equal(await pdf.text(),'%PDF-');
    }
    assert.equal((await send('/midias/_private/core/LD-WH001/source.png')).status, 401);
    assert.equal((await send('/midias/core/LD-WH001/web.webp')).status, 503);
    const post = body => send('/midias/_publish', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal((await post(publication())).status, 200);
    assert.equal((await post(publication())).status, 200);
    assert.equal((await send('/midias/core/LD-WH001/source.png')).status, 404);
    assert.equal((await send('/midias/_private/core/LD-WH001/source.png', { headers: { Authorization: `Bearer ${token}` } })).status, 200);
    const file = await send('/midias/produtos/LD-WH001'); assert.equal(file.status, 200); assert.equal(await file.text(), 'webp-image');
    const partial = await send('/midias/produtos/LD-WH001', { headers: { Range: 'bytes=0-3' } }); assert.equal(partial.status, 206); assert.equal(await partial.text(), 'webp');
    const conditional = await send('/midias/produtos/LD-WH001', { headers: { 'If-None-Match': file.headers.get('etag') } }); assert.equal(conditional.status, 304);
    const data = await (await send('/midias/catalogo.json')).json(); assert.equal('price' in data.products[0], false);
    const html = await (await send('/core/ld-wh001/')).text(); assert.match(html, /Agachamento &lt;teste&gt;/); assert.doesNotMatch(html, /Agachamento <teste>/);
    const embedded = html.match(/<script type="application\/json" id="catalogo-publicado">(.*?)<\/script>/s);
    assert.ok(embedded);
    assert.equal(JSON.parse(embedded[1]).products[0].nome, publication().products[0].nome);
    const newer = publication(); newer.id = '22222222-2222-4222-8222-222222222222'; newer.sequence = 2; assert.equal((await post(newer)).status, 200);
    assert.equal((await post(publication())).status, 409);
  } finally { await mf.dispose(); }
});

test('novas fotos são privadas, imutáveis e só entram no catálogo após publicação', async () => {
  const token='isolated-upload-test-token-123456789';
  const mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('../workers/catalog-media.mjs',import.meta.url)),compatibilityDate:'2026-07-30',r2Buckets:['MEDIA'],bindings:{PUBLISH_TOKEN:token}});
  try {
    const bucket=await mf.getR2Bucket('MEDIA');
    await bucket.put('ludus/catalogo/v1/manifest.json',JSON.stringify(manifest));
    const send=(path,init)=>mf.dispatchFetch('https://ludusequipamentos.com'+path,init);
    const hash=value=>createHash('sha256').update(value).digest('hex');
    const source='private-original-bytes', prefix=hash(source)+'/core/LD-WH001/';
    const upload=(name,bytes,extra={})=>send('/midias/_upload/'+prefix+name,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':name.endsWith('.png')?'image/png':'image/webp','X-Content-Sha256':hash(bytes),...extra},body:bytes});
    assert.equal((await upload('source.png',source,{Authorization:''})).status,401);
    assert.equal((await upload('source.png',source)).status,200);
    assert.equal((await upload('web.webp','derivative')).status,200);
    assert.equal((await upload('web.webp','derivative')).status,200);
    assert.equal((await upload('web.webp','changed')).status,409);
    assert.equal((await send('/midias/_private/uploads/'+prefix+'source.png')).status,401);
    const pending=await send('/midias/produtos/LD-WH001'); assert.equal(pending.status,503);
    const input=publication(); input.products[0].imageKey='ludus/catalogo/uploads/'+prefix+'source.png';
    const publish=()=>send('/midias/_publish',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
    assert.equal((await publish()).status,422);
    input.products[0].imageKey='ludus/catalogo/uploads/'+prefix+'web.webp';
    assert.equal((await publish()).status,200);
    assert.equal(await (await send('/midias/produtos/LD-WH001')).text(),'derivative');
  } finally {await mf.dispose();}
});
