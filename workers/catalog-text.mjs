import { converterHtml } from '@avilaops/publicacao-texto';

const ORIGIN = 'https://ludusequipamentos.com';
const MAX_HTML_BYTES = 2_000_000;
const headersForText = () => new Headers({
  'X-Robots-Tag': 'noindex',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-cache, must-revalidate',
});

function unavailable(status) {
  const headers = headersForText();
  headers.set('Cache-Control', 'no-store');
  return new Response(null, { status, headers });
}

/** Resolve a cópia usando o mesmo roteador HTML; nunca busca um Host do visitante. */
export async function catalogText(request, resolveHtml) {
  const url = new URL(request.url);
  if (!/^\/(?:core|loja)\/.*\.mdx?$/i.test(url.pathname)) return;
  if (!['GET', 'HEAD'].includes(request.method)) return unavailable(405);
  if (!['ludusequipamentos.com', 'www.ludusequipamentos.com'].includes(url.hostname)) return unavailable(421);
  if (url.search) return unavailable(400);
  const match = /^\/(?:core|loja)\/(?:[a-z0-9-]+\/)?index\.(mdx?)$/.exec(url.pathname);
  if (!match) return unavailable(404);
  const format = match[1];
  const canonical = new URL(url.pathname.replace(/index\.mdx?$/, ''), ORIGIN).href;
  // GET anônimo e incondicional: HEAD/Range/ETag/cookies não alteram o HTML-base.
  const html = await resolveHtml(new Request(canonical, { headers: { Accept: 'text/html' } }));
  if (html.status === 304 || html.status === 206) { await html.body?.cancel(); return unavailable(502); }
  if (html.status !== 200 || html.headers.has('www-authenticate')) {
    await html.body?.cancel();
    // Não propaga redirects, desafios ou corpos de erro da origem.
    return unavailable(html.status === 404 || html.status >= 500 ? html.status : 404);
  }
  if (!/^text\/html(?:;|$)/i.test(html.headers.get('content-type') ?? '')
    || /\b(?:noindex|none)\b/i.test(html.headers.get('x-robots-tag') ?? '')
    || html.headers.has('set-cookie')
    || /\b(?:cookie|authorization)\b/i.test(html.headers.get('vary') ?? '')) {
    await html.body?.cancel();
    return unavailable(404);
  }
  const reader = html.body?.getReader();
  const chunks = [];
  let length = 0;
  if (reader) for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_HTML_BYTES) { await reader.cancel(); return unavailable(413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const result = converterHtml(new TextDecoder().decode(bytes), { url: canonical, formato: format });
  if (!result.indexavel || result.metadados.canonical !== canonical) return unavailable(404);
  const body = result.conteudo;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ludus\n${canonical}\n${format}\n${body}`));
  const etag = '"' + Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join('') + '"';
  const headers = headersForText();
  headers.set('Content-Type', `text/${format === 'md' ? 'markdown' : 'mdx'}; charset=utf-8`);
  headers.set('ETag', etag);
  headers.set('Link', `<${canonical}>; rel="canonical"; type="text/html", <${ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`);
  const version = html.headers.get('x-ludus-catalog-version');
  if (version) headers.set('X-Ludus-Catalog-Version', version);
  // Esta comparação ocorre somente depois da publicação e do HTML atuais.
  if ((request.headers.get('if-none-match') ?? '').split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : body, { headers });
}
