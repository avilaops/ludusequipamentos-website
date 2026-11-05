const DEFAULT_ROOT = 'ludus/catalogo/v1/';
const PUBLICATION = 'ludus/publications/current.json';
const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const IMAGE = /^(core|premium)\/(LD-[A-Z0-9]+)\/(web\.webp|black\.png|thumbnail\.jpg)$/;
const PRIVATE = /^(core|premium)\/(LD-[A-Z0-9]+)\/(source\.(?:png|jpg)|web\.webp|black\.png|thumbnail\.jpg)$/;
const UPLOAD = /^([0-9a-f]{64})\/(core|premium)\/(LD-[A-Z0-9]+)\/(source\.(?:jpg|png|webp)|web\.webp|thumbnail\.webp)$/;
const failure = (status, message) => Response.json({ title: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const groupName = value => ({ Deltoides: 'Ombros', 'Abdômen': 'Abdômen e lombar', Multitrabalho: 'Multifuncionais' })[value] ?? value;

async function authorized(request, env) {
  if (!env.PUBLISH_TOKEN) return false;
  const encoder = new TextEncoder();
  const hashes = await Promise.all([request.headers.get('authorization') ?? '', `Bearer ${env.PUBLISH_TOKEN}`].map(s => crypto.subtle.digest('SHA-256', encoder.encode(s))));
  return crypto.subtle.timingSafeEqual(hashes[0], hashes[1]);
}
async function bytesBody(request, limit = 1_000_000) {
  const reader = request.body?.getReader();
  let size = 0; const chunks = [];
  if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('body-limit'); } chunks.push(value); }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
  return joined;
}
async function jsonBody(request) { return JSON.parse(new TextDecoder().decode(await bytesBody(request))); }

/** Construct public fields explicitly, never leak prices or internal records. */
export function validatePublication(value, manifest, registered = []) {
  if (!UUID.test(value?.id) || !Number.isSafeInteger(value.sequence) || value.sequence < 1 || !Array.isArray(value.products) || !value.products.length || value.products.length > 1000) throw new Error('publication-invalid');
  const sources = new Map(manifest.products.map(p => [p.sku, p]));
  const codes = new Set(); const paths = new Set();
  const products = value.products.map(p => {
    const original = sources.get(p.code);
    if (!original || codes.has(p.code) || paths.has(p.url) || !['core', 'premium'].includes(p.colecao)
      || !/^\/(core|loja)\/[a-z0-9-]+\/$/.test(p.url) || !Array.isArray(p.dim) || p.dim.length !== 3 || p.dim.some(n => !Number.isInteger(n) || n < 1 || n > 50000)
      || ![...original.assets, ...registered.filter(a=>a.sku===p.code)].some(a => a.storage_key === p.imageKey && ['webp', 'black', 'thumbnail'].includes(a.variant))) throw new Error('product-invalid');
    for (const [key, max] of [['nome', 200], ['grupo_muscular', 80], ['linha', 80], ['descricao', 4000], ['peso', 80], ['bateria', 80]]) {
      if (typeof p[key] !== 'string' || p[key].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(p[key])) throw new Error('text-invalid');
    }
    if (!p.nome.trim() || !p.grupo_muscular.trim() || !p.linha.trim()) throw new Error('text-empty');
    codes.add(p.code); paths.add(p.url);
    return { code:p.code, nome:p.nome, colecao:p.colecao, grupo_muscular:p.grupo_muscular, linha:p.linha, dim:p.dim, descricao:p.descricao, peso:p.peso, bateria:p.bateria, url:p.url, imageKey:p.imageKey };
  });
  return { id:value.id, sequence:value.sequence, products };
}

async function serveObject(request, env, key, privateFile = false) {
  if (!['GET', 'HEAD'].includes(request.method)) return failure(405, 'Método não permitido');
  const range = request.headers.get('range');
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return failure(416, 'Intervalo inválido');
  const object = await env.MEDIA.get(key, { ...(range ? { range: request.headers } : {}), onlyIf: request.headers });
  if (!object) return failure(404, 'Arquivo não encontrado');
  const headers = new Headers({ 'Cache-Control': privateFile ? 'private, no-store' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'ETag': object.httpEtag, 'Accept-Ranges': 'bytes' });
  object.writeHttpMetadata(headers);
  if (!('body' in object)) return new Response(null, { status: request.headers.has('if-none-match') ? 304 : 412, headers });
  if (range && object.range) { headers.set('Content-Range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`); headers.set('Content-Length', String(object.range.length)); }
  else headers.set('Content-Length', String(object.size));
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range && object.range ? 206 : 200, headers });
}

function card(p) {
  return `<a class="card" href="${escape(p.url)}" data-linha="${escape(p.linha)}" data-colecao="${p.colecao}" data-grupo="${escape(groupName(p.grupo_muscular))}" data-busca="${escape(`${p.code} ${p.nome}`.toLowerCase())}"><div class="stage"><img src="/midias/produtos/${p.code}" alt="${escape(p.nome)}" width="800" height="600" loading="lazy" /></div><div class="txt"><span class="colecao">Linha ${p.colecao === 'core' ? 'Core' : 'Premium'}</span><span class="code">${p.code}</span><span class="name">${escape(p.nome)}</span><span class="meta">${escape(groupName(p.grupo_muscular))}</span></div></a>`;
}

function dimensionalPlan(p) {
  const [depth, width] = p.dim;
  const scale = Math.min(250 / width, 230 / depth);
  const w = width * scale, h = depth * scale;
  const x = (380 - w) / 2, y = (290 - h) / 2;
  return `<svg viewBox="0 0 400 350" role="img" aria-label="Envelope dimensional de ${escape(p.nome)}" style="width:100%;max-height:380px;font:14px sans-serif"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#141413"/><text x="190" y="${y+h+30}" text-anchor="middle" fill="#57544e">${width} mm</text><text transform="translate(${x+w+28},${y+h/2}) rotate(-90)" text-anchor="middle" fill="#57544e">${depth} mm</text></svg><p>Vista superior esquemática · envelope dimensional em mm</p>`;
}

async function website(request, publication) {
  const origin = await fetch(request);
  if (!origin.ok || !origin.headers.get('content-type')?.includes('text/html')) return origin;
  const path = new URL(request.url).pathname;
  const products = publication.products;
  const product = products.find(p => p.url === path);
  const collection = path === '/loja/core/' ? 'core' : path === '/loja/premium/' ? 'premium' : null;
  const isCollection = ['/loja/', '/loja/core/', '/loja/premium/'].includes(path);
  const core = products.filter(p => p.colecao === 'core');
  const premium = products.filter(p => p.colecao === 'premium');
  const balanced = Array.from({length: Math.max(core.length, premium.length)}, (_, i) => [core[i], premium[i]]).flat().filter(Boolean);
  const selected = collection ? products.filter(p => p.colecao === collection) : balanced;
  const byCode = new Map(products.map(p => [p.code, p]));
  const rewriter = new HTMLRewriter().on('[data-catalog-field]', { element(el) {
    const p = byCode.get(el.getAttribute('data-catalog-code')) ?? product;
    if (!p) return;
    const field = el.getAttribute('data-catalog-field');
    const values = { nome:p.nome, descricao:p.descricao, linha:p.linha, grupo_muscular:p.grupo_muscular, peso:p.peso, bateria:p.bateria,
      dimensoes:`${p.dim.join(' × ')} mm`, profundidade:`${p.dim[0]} mm`, largura:`${p.dim[1]} mm`, altura:`${p.dim[2]} mm`,
      area:((p.dim[0]/1000+1.2)*(p.dim[1]/1000+1.2)).toLocaleString('pt-BR',{maximumFractionDigits:2})+' m²',
      nominal:(p.dim[0]*p.dim[1]/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' m²' };
    if (Object.hasOwn(values, field)) el.setInnerContent(values[field] || 'Consultar');
  }}).on('head', { element(el) { el.append(`<script type="application/json" id="catalogo-publicado">${JSON.stringify(publication).replace(/</g, '\\u003c')}</script>`, { html:true }); } });
  if (product) {
    rewriter.on('[data-catalog-plan]', { element(el) { if (el.getAttribute('data-catalog-dim') !== JSON.stringify(product.dim)) el.setInnerContent(dimensionalPlan(product), {html:true}); } });
    rewriter.on('title', { element(el) { el.setInnerContent(`${product.nome} ${product.code} · Ludus ${product.colecao === 'core' ? 'Core' : 'Premium'}`); } });
    rewriter.on('meta[name="description"]', { element(el) { el.setAttribute('content', product.descricao.slice(0,160)); } });
    rewriter.on('script[type="application/ld+json"]', { element(el) { el.setInnerContent(JSON.stringify({ '@context':'https://schema.org', '@type':'Product', name:product.nome, sku:product.code, description:product.descricao, image:`https://ludusequipamentos.com/midias/produtos/${product.code}`, url:`https://ludusequipamentos.com${product.url}`, brand:{'@type':'Brand', name:product.colecao === 'core' ? 'Ludus Core' : 'Ludus Premium'} }).replace(/</g,'\\u003c'), {html:true}); } });
  }
  if (isCollection) {
    rewriter.on('[data-catalog-count]', { element(el) { const line=el.getAttribute('data-catalog-count'); el.setInnerContent(String(line==='all' ? products.length : products.filter(p=>p.colecao===line).length)); } });
    rewriter.on('#grade', { element(el) { el.setInnerContent(selected.map(card).join(''), { html:true }); } });
    rewriter.on('#conta', { element(el) { el.setInnerContent(`${selected.length} equipamentos`); } });
    rewriter.on('[data-filtro="grupo"]', { element(el) { el.setInnerContent('<button class="chip" data-v="" aria-pressed="true">Todos</button>'+[...new Set(selected.map(p=>groupName(p.grupo_muscular)))].map(g=>`<button class="chip" data-v="${escape(g)}" aria-pressed="false">${escape(g)}</button>`).join(''),{html:true}); } });
  }
  const transformed = rewriter.transform(origin);
  const headers = new Headers(transformed.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('Cache-Control','public, max-age=0, must-revalidate'); headers.set('X-Ludus-Catalog-Version',String(publication.sequence));
  return new Response(transformed.body,{status:transformed.status,headers});
}

export default {
  async fetch(request, env) {
    const ROOT = env.LIBRARY_VERSION === '2' ? 'ludus/catalogo/v2/' : DEFAULT_ROOT;
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith('/midias/_upload/')) {
        if (request.method !== 'PUT') return failure(405,'Método não permitido');
        if (!await authorized(request,env)) return failure(401,'Acesso não autorizado');
        const suffix=path.slice('/midias/_upload/'.length), match=UPLOAD.exec(suffix);
        if (!match) return failure(422,'Localizador inválido');
        const manifestObject=await env.MEDIA.get(ROOT+'manifest.json');
        if (!manifestObject || !(await manifestObject.json()).products.some(p=>p.sku===match[3])) return failure(422,'SKU não registrado');
        const mime=match[4].endsWith('.jpg')?'image/jpeg':match[4].endsWith('.png')?'image/png':'image/webp';
        if (request.headers.get('content-type')!==mime) return failure(415,'Tipo de imagem inválido');
        let bytes; try { bytes=await bytesBody(request,10_000_000); } catch { return failure(413,'Imagem muito grande'); }
        const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
        if (sha!==request.headers.get('x-content-sha256') || (match[4].startsWith('source.') && sha!==match[1])) return failure(422,'Hash divergente');
        const key='ludus/catalogo/uploads/'+suffix;
        const old=await env.MEDIA.head(key);
        if (old) return old.customMetadata?.sha256===sha ? Response.json({stored:true}) : failure(409,'Versão imutável');
        const variant=match[4].startsWith('source.')?'source':match[4]==='web.webp'?'webp':'thumbnail';
        const saved=await env.MEDIA.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:mime},customMetadata:{sha256:sha,sku:match[3],variant}});
        return saved ? Response.json({stored:true}) : failure(409,'Envio concorrente; repita');
      }
      if (path === '/midias/_publish') {
        if (request.method !== 'POST') return failure(405, 'Método não permitido');
        if (!await authorized(request,env)) return failure(401,'Acesso não autorizado');
        const manifestObject = await env.MEDIA.get(ROOT+'manifest.json');
        if (!manifestObject) return failure(503,'Biblioteca indisponível');
        let data;
        try {
          const input=await jsonBody(request), registered=[];
          if (!Array.isArray(input?.products) || input.products.length>1000) throw new Error('publication-invalid');
          for (const p of input.products) {
            const suffix=typeof p.imageKey==='string' && p.imageKey.startsWith('ludus/catalogo/uploads/') ? p.imageKey.slice('ludus/catalogo/uploads/'.length) : '';
            const match=UPLOAD.exec(suffix);
            if (!match || match[3]!==p.code || match[4].startsWith('source.')) continue;
            const asset=await env.MEDIA.head(p.imageKey);
            if (asset?.customMetadata?.sku===p.code && ['webp','thumbnail'].includes(asset.customMetadata.variant)) registered.push({sku:p.code,storage_key:p.imageKey,variant:asset.customMetadata.variant});
          }
          data=validatePublication(input,await manifestObject.json(),registered);
        } catch { return failure(422,'Publicação inválida'); }
        const current=await env.MEDIA.get(PUBLICATION);
        const previous=current ? await current.json() : null;
        if (previous?.id===data.id) return Response.json({published:true,id:data.id});
        if (previous && previous.sequence>=data.sequence) return failure(409,'Existe uma publicação mais recente');
        await env.MEDIA.put(`ludus/publications/${data.id}.json`,JSON.stringify(data),{httpMetadata:{contentType:'application/json'}});
        const saved=await env.MEDIA.put(PUBLICATION,JSON.stringify(data),{onlyIf:current ? {etagMatches:current.etag} : {etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
        return saved ? Response.json({published:true,id:data.id}) : failure(409,'Publicação concorrente; confira novamente');
      }
      if (path.startsWith('/midias/_private/')) {
        if (!await authorized(request,env)) return failure(401,'Acesso não autorizado');
        const requested=path.slice('/midias/_private/'.length);
        if (requested.startsWith('uploads/')) return UPLOAD.test(requested.slice(8)) ? await serveObject(request,env,'ludus/catalogo/'+requested,true) : failure(404,'Arquivo não encontrado');
        const versioned=/^(v[1-9][0-9]{0,5})\/(.+)$/.exec(requested);
        const key=versioned ? versioned[2] : requested;
        const prefix=versioned ? `ludus/catalogo/${versioned[1]}/` : ROOT;
        return PRIVATE.test(key) ? await serveObject(request,env,prefix+key,true) : failure(404,'Arquivo não encontrado');
      }
      if (path==='/catalogos/ludus-core.pdf' || path==='/catalogos/ludus-premium.pdf') return await serveObject(request,env,'ludus/catalogos/'+(env.LIBRARY_VERSION === '2' && path.endsWith('premium.pdf') ? 'originais-2026-11-04/' : '2026-11-04/')+path.split('/').at(-1));
      if (!path.startsWith('/midias/') && /\.[a-z0-9]+$/i.test(path)) return fetch(request);
      const current=await env.MEDIA.get(PUBLICATION);
      if (!current) return path.startsWith('/midias/') ? failure(503,'Catálogo indisponível') : fetch(request);
      const publication=await current.json();
      if (/^\/(core|loja)\/[a-z0-9-]+\/$/.test(path) && !['/loja/core/','/loja/premium/'].includes(path) && !publication.products.some(p=>p.url===path)) return failure(404,'Equipamento não disponível no catálogo');
      if (path==='/midias/catalogo.json') return ['GET','HEAD'].includes(request.method) ? new Response(request.method==='HEAD'?null:JSON.stringify(publication),{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=30','X-Content-Type-Options':'nosniff'}}) : failure(405,'Método não permitido');
      if (path.startsWith('/midias/produtos/')) {
        const p=publication.products.find(p=>p.code===path.slice('/midias/produtos/'.length));
        return p ? await serveObject(request,env,p.imageKey) : failure(404,'Produto não encontrado');
      }
      if (path.startsWith('/midias/')) {
        const key=path.slice('/midias/'.length); const match=IMAGE.exec(key);
        if (!match || !publication.products.some(p=>p.code===match[2])) return failure(404,'Arquivo não encontrado');
        return await serveObject(request,env,ROOT+key);
      }
      if (!['GET','HEAD'].includes(request.method)) return fetch(request);
      return await website(request,publication);
    } catch {
      console.error(JSON.stringify({event:'catalog_gateway_failed',path}));
      return failure(503,'Catálogo temporariamente indisponível');
    }
  },
};
