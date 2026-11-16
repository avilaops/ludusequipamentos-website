/** Reuses the existing Ludus CMP • no additional banner or consent storage. */
export function installLudusConsent({ window: win, document: doc, loadRuntime } = {}) {
  if (!['ludusequipamentos.com', 'www.ludusequipamentos.com'].includes(win.location.hostname)) return;
  const banner = doc.getElementById('cookies');
  const controls = [...doc.querySelectorAll('[data-cookies-manage]')];
  let choice = null;
  let runtime;
  let loading;
  try { choice = win.localStorage.getItem('ludus-cookies'); } catch { /* Session-only preferences. */ }
  if (!['sim', 'nao'].includes(choice)) choice = null;
  const load = loadRuntime || (async () => {
    await import('./measurement/entry.mjs');
    return win.__avilaMeasurement;
  });
  function sync() {
    if (choice !== 'sim') { runtime?.setConsent(false); return Promise.resolve(); }
    if (runtime) { runtime.setConsent(true); return Promise.resolve(); }
    if (!loading) loading = load().then(api => {
      if (!api) throw new Error('Measurement unavailable');
      runtime = api;
      // Read the current choice • a pending import must not undo revocation.
      runtime.setConsent(choice === 'sim');
    }).catch(() => { loading = null; });
    return loading;
  }
  function clearCookies() {
    for (const cookie of doc.cookie.split(';')) {
      const name = cookie.trim().split('=')[0];
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
      for (const domain of ['', win.location.hostname, '.ludusequipamentos.com']) doc.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax; Secure${domain ? '; Domain=' + domain : ''}`;
    }
  }
  async function choose(value) {
    if (!['sim', 'nao'].includes(value)) return;
    choice = value;
    try { win.localStorage.setItem('ludus-cookies', choice); } catch { /* Session-only decision. */ }
    banner.hidden = true;
    if (choice === 'nao') clearCookies();
    controls[0]?.focus();
    await sync();
  }
  for (const control of controls) {
    control.hidden = false;
    control.addEventListener('click', () => {
      banner.hidden = false;
      banner.querySelector('[data-cookies]')?.focus();
    });
  }
  for (const button of banner.querySelectorAll('[data-cookies]')) button.addEventListener('click', () => choose(button.dataset.cookies));
  win.ludusEvento = (name, data = {}) => {
    if (choice !== 'sim' || !runtime) return false;
    if (name === 'envio_formulario' && data.canal === 'site') return runtime.track('form_submitted', { form_type: 'orcamento' });
    if (name === 'envio_formulario' && data.canal === 'whatsapp') return runtime.track('contact_click', { contact_channel: 'whatsapp' });
    if (name === 'interacao_3d') return runtime.track('feature_used', { feature_name: 'visualizacao_3d' });
    return false;
  };
  doc.addEventListener('ludus:3d', () => win.ludusEvento('interacao_3d'));
  banner.hidden = choice !== null;
  if (choice === 'nao') clearCookies();
  void sync();
  return { choose };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') installLudusConsent({ window, document });
