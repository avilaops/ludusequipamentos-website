import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveRoute } from '../dist/measurement/core.mjs';

test('the deployed inventory includes real pages and excludes unknown private references and 404', async () => {
  const config = JSON.parse(await readFile(new URL('../dist/measurement/sites.json', import.meta.url)));
  const site = config.sites.find(site => site.domain === 'ludusequipamentos.com');
  assert.ok(Array.isArray(site.publicPaths) && site.publicPaths.length > 100);
  assert.equal(resolveRoute(config, 'https://ludusequipamentos.com/').measurementId, 'G-HV13SD6KZW');
  assert.equal(resolveRoute(config, 'https://ludusequipamentos.com/orcamento/').measurementId, 'G-HV13SD6KZW');
  const product = site.publicPaths.find(path => path.startsWith('/loja/') && path !== '/loja/');
  assert.equal(resolveRoute(config, 'https://ludusequipamentos.com' + product).measurementId, 'G-HV13SD6KZW');
  for (const path of ['/orcamento/CLIENTE-PRIVATE', '/404', '/404.html', '/unknown-private-route']) assert.equal(resolveRoute(config, 'https://ludusequipamentos.com' + path), null, path);
});
