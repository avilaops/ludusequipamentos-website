const RESERVED = /^\/(api|oauth|\.well-known|_next|cdn-cgi)(\/|$)/i;
const BLOCKED = new Set(['redirect', 'sso']);
const MATCH_ID = /^[A-Z]+-[A-Z0-9]{6,20}$/;
const CAMPAIGN_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const EVENTS = new Set(['page_view', 'click', 'contact_click', 'form_submitted', 'sign_up', 'login', 'activation_completed', 'feature_used', 'subscription_started', 'view_item_list', 'select_item', 'view_item', 'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund']);

function matches(path, prefix) {
  return prefix === '/' ? path === '/' : path === prefix || path.startsWith(prefix + '/');
}

export function resolveRoute(config, rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || RESERVED.test(url.pathname)) return null;
  const hostSite = config.sites.find(s => s.domain === url.hostname || s.aliases?.includes(url.hostname));
  if (!hostSite || BLOCKED.has(hostSite.operation)) return null;
  let site = hostSite;
  let publicOverride = false;
  let longest = -1;
  for (const candidate of config.sites) {
    if (BLOCKED.has(candidate.operation)) continue;
    for (const location of candidate.publicLocations || []) {
      if (location.hostname !== hostSite.domain) continue;
      for (const prefix of location.prefixes) if (prefix.length > longest && matches(url.pathname, prefix)) {
        site = candidate;
        publicOverride = true;
        longest = prefix.length;
      }
    }
  }
  if (!MATCH_ID.test(site.measurementId || '')) return null;
  if (Array.isArray(site.publicPaths)) {
    const canonicalPath = path => path.replace(/\/+$/, '') || '/';
    if (!site.publicPaths.some(path => canonicalPath(path) === canonicalPath(url.pathname))) return null;
  }
  let operation = publicOverride ? 'institutional' : site.operation;
  if (operation === 'saas' || operation === 'platform') {
    if (site.applicationPrefixes?.some(prefix => matches(url.pathname, prefix))) {
      operation = site.operation;
    } else if (site.publicPrefixes?.some(prefix => matches(url.pathname, prefix))) {
      operation = 'institutional';
    } else return null;
  }
  const containerId = config.operations[operation]?.id;
  if (!/^GTM-[A-Z0-9]{6,15}$/.test(containerId || '')) return null;
  const privateRoute = !publicOverride && site.privatePrefixes?.some(prefix => matches(url.pathname, prefix));
  const gatewayPath = /^\/[a-zA-Z0-9]{1,98}\/$/.test(hostSite.gatewayPath || '') ? hostSite.gatewayPath : null;
  return { domain: site.domain, operation, area: privateRoute || operation === 'saas' || operation === 'platform' ? 'application' : 'public', measurementId: site.measurementId, containerId, ...(hostSite.consentAdapter ? { consentAdapter: hostSite.consentAdapter } : {}), ...(gatewayPath ? { gatewayPath } : {}) };
}

export function sanitizeUrl(rawUrl, area = 'public') {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (area === 'application') return url.origin + '/app';
  const segments = url.pathname.split('/').map(segment => {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { return 'item'; }
    return /@|\b\d{6,}\b|^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(decoded) || decoded.length > 100 ? 'item' : segment;
  });
  const clean = new URL(url.origin + segments.join('/'));
  for (const key of CAMPAIGN_KEYS) {
    const value = url.searchParams.get(key);
    if (value && /^[a-zA-Z0-9._-]{1,80}$/.test(value) && !/\d{9,}/.test(value)) clean.searchParams.set(key, value);
  }
  return clean.toString();
}

function safeText(value, max = 100) {
  return typeof value === 'string' && value.length <= max && !/@|[\r\n<>]/.test(value) ? value : undefined;
}

export function sanitizeEvent(name, input = {}) {
  if (!EVENTS.has(name) || !input || typeof input !== 'object') return null;
  if (name === 'purchase' && (input.confirmed !== true || !safeText(input.transaction_id) || !Number.isFinite(input.value) || input.value < 0 || !/^[A-Z]{3}$/.test(input.currency || ''))) return null;
  const parameters = {};
  for (const key of ['transaction_id', 'currency', 'method', 'feature_name', 'form_type', 'contact_channel', 'site_area', 'operation']) {
    const value = safeText(input[key]);
    if (value !== undefined) parameters[key] = value;
  }
  for (const key of ['value', 'tax', 'shipping']) if (Number.isFinite(input[key]) && input[key] >= 0) parameters[key] = input[key];
  if (Array.isArray(input.items)) parameters.items = input.items.slice(0, 200).map(item => {
    const clean = {};
    for (const key of ['item_id', 'item_name', 'item_category', 'item_brand', 'item_variant']) {
      const value = safeText(item?.[key], 150); if (value !== undefined) clean[key] = value;
    }
    for (const key of ['price', 'quantity', 'discount']) if (Number.isFinite(item?.[key]) && item[key] >= 0) clean[key] = item[key];
    return clean;
  }).filter(item => item.item_id || item.item_name);
  return { name, parameters };
}


/** Keep public acquisition origins without transmitting referring paths or credentials. */
export function sanitizeReferrer(rawUrl, config, currentUrl) {
  let url, current;
  try { url = new URL(rawUrl); current = new URL(currentUrl); } catch { return ''; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return '';
  const host = url.hostname;
  if (host === current.hostname || !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':') || /\.(local|internal|lan|localhost)$/.test(host)) return '';
  if (host === 'avilaops.com' || host.endsWith('.avilaops.com') || ['accounts.google.com', 'login.microsoftonline.com', 'login.live.com'].includes(host)) return '';
  if (config.sites.some(site => site.domain === host || site.aliases?.includes(host))) return '';
  return url.origin + '/';
}
