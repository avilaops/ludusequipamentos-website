import test from 'node:test';
import assert from 'node:assert/strict';
import { installLudusConsent } from '../public/consentimento-medicao.mjs';

function fixture(saved = null, hostname = 'ludusequipamentos.com') {
  const storage = new Map(saved ? [['ludus-cookies', saved]] : []);
  const handlers = {};
  const button = value => ({ dataset: { cookies: value }, addEventListener: (_, fn) => { handlers[value] = fn; }, focus() {} });
  const buttons = [button('sim'), button('nao')];
  const manage = { hidden: true, addEventListener: (_, fn) => { handlers.manage = fn; }, focus() {} };
  const banner = { hidden: true, querySelectorAll: () => buttons, querySelector: () => buttons[0] };
  const document = { cookie: '', getElementById: () => banner, querySelectorAll: () => [manage], addEventListener() {} };
  const window = { location: { hostname }, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } };
  return { window, document, banner, manage, handlers, storage };
}

test('the existing Ludus choice controls loading and preferences remain accessible after refusal', async () => {
  const f = fixture();
  const calls = [];
  let loads = 0;
  installLudusConsent({ ...f, loadRuntime: async () => { loads++; return { setConsent: value => calls.push(value) }; } });
  assert.equal(loads, 0);
  assert.equal(f.banner.hidden, false);
  assert.equal(f.manage.hidden, false);
  await f.handlers.sim();
  assert.equal(loads, 1);
  assert.deepEqual(calls, [true]);
  assert.equal(f.storage.get('ludus-cookies'), 'sim');
  f.handlers.manage();
  assert.equal(f.banner.hidden, false);
  await f.handlers.nao();
  assert.deepEqual(calls, [true, false]);
  assert.equal(f.storage.get('ludus-cookies'), 'nao');
});

test('a revocation while the runtime loads cannot restore stale consent', async () => {
  const f = fixture();
  const calls = [];
  let release;
  installLudusConsent({ ...f, loadRuntime: () => new Promise(resolve => { release = resolve; }) });
  const loading = f.handlers.sim();
  await f.handlers.nao();
  release({ setConsent: value => calls.push(value) });
  await loading;
  assert.deepEqual(calls, [false]);
});

test('approved event bridges discard personal fields and require measurement consent', async () => {
  const f = fixture();
  const events = [];
  installLudusConsent({ ...f, loadRuntime: async () => ({ setConsent() {}, track: (...args) => { events.push(args); return true; } }) });
  f.window.ludusEvento('envio_formulario', { canal: 'site' });
  assert.deepEqual(events, []);
  await f.handlers.sim();
  f.window.ludusEvento('envio_formulario', { canal: 'site', email: 'private@example.invalid' });
  f.window.ludusEvento('envio_formulario', { canal: 'whatsapp', mensagem: 'private' });
  f.window.ludusEvento('interacao_3d', { codigo: 'CUSTOMER-PRIVATE' });
  f.window.ludusEvento('unknown', { email: 'private@example.invalid' });
  assert.deepEqual(events, [['form_submitted', { form_type: 'orcamento' }], ['contact_click', { contact_channel: 'whatsapp' }], ['feature_used', { feature_name: 'visualizacao_3d' }]]);
  await f.handlers.nao();
  f.window.ludusEvento('interacao_3d');
  assert.equal(events.length, 3);
});

test('preview and redirect hosts never initialize the Ludus CMP integration', () => {
  const f = fixture('sim', 'ludusequipamentos.com.br');
  let loads = 0;
  installLudusConsent({ ...f, loadRuntime: () => { loads++; } });
  assert.equal(loads, 0);
  assert.equal(f.window.ludusEvento, undefined);
});
