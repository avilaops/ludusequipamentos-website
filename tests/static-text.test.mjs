import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { publicarDiretorio } from '@avilaops/publicacao-texto/arquivos';

test('geração estática remove cópias antigas do catálogo, preserva páginas estáticas e restaura cabeçalhos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ludus-static-text-'));
  const html = '<html><head><title>Oficina exemplo</title></head><body><main><h1>Oficina exemplo</h1><p>Conteúdo público fictício</p></main></body></html>';
  try {
    await mkdir(join(root, 'core', 'equipamento-exemplo'), { recursive: true });
    await writeFile(join(root, 'index.html'), html);
    await writeFile(join(root, 'core', 'equipamento-exemplo', 'index.html'), html);
    await writeFile(join(root, '_headers'), '/*\n  X-Frame-Options: DENY\n');
    await publicarDiretorio({ diretorio: root, origem: 'https://ludusequipamentos.com' });
    const run = () => new Promise(resolve => execFile(process.execPath, [fileURLToPath(new URL('../scripts/publish-static-text.mjs', import.meta.url)), '--diretorio', root], (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })));
    const first = await run();
    assert.equal(first.code, 0, first.stderr);
    await assert.rejects(access(join(root, 'core', 'equipamento-exemplo', 'index.mdx')));
    assert.match(await readFile(join(root, 'index.mdx'), 'utf8'), /Oficina exemplo/);
    const headers = await readFile(join(root, '_headers'), 'utf8');
    assert.match(headers, /X-Frame-Options: DENY/);
    assert.doesNotMatch(headers, /ludus-catalog-text|\/core\/\*|\/loja\/\*/);
    const manifest = JSON.parse(await readFile(join(root, 'publicacao-texto.json'), 'utf8'));
    assert.deepEqual(manifest.paginas.map(p => p.rota), ['/']);
    assert.doesNotMatch(await readFile(join(root, 'llms.txt'), 'utf8'), /core\/equipamento-exemplo/);
    assert.equal((await run()).code, 0);
    assert.equal(await readFile(join(root, '_headers'), 'utf8'), headers);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('falha na conversão restaura os cabeçalhos manuais e impede publicação parcial', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ludus-static-text-failure-'));
  try {
    const headers = '/*\n  X-Frame-Options: DENY\n';
    await writeFile(join(root, '_headers'), headers);
    await writeFile(join(root, 'index.html'), '<html><body><main></main></body></html>');
    const result = await new Promise(resolve => execFile(process.execPath, [fileURLToPath(new URL('../scripts/publish-static-text.mjs', import.meta.url)), '--diretorio', root], error => resolve(error?.code ?? 0)));
    assert.equal(result, 1);
    assert.equal(await readFile(join(root, '_headers'), 'utf8'), headers);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('sem cabeçalhos prévios o filtro temporário também é removido e a geração é idempotente', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ludus-static-text-empty-'));
  try {
    await mkdir(join(root, 'loja'), { recursive: true });
    const html = '<html><head><title>Exemplo</title></head><body><main><h1>Exemplo</h1></main></body></html>';
    await writeFile(join(root, 'index.html'), html);
    await writeFile(join(root, 'loja', 'index.html'), html);
    const run = () => new Promise(resolve => execFile(process.execPath, [fileURLToPath(new URL('../scripts/publish-static-text.mjs', import.meta.url)), '--diretorio', root], error => resolve(error?.code ?? 0)));
    assert.equal(await run(), 0);
    const headers = await readFile(join(root, '_headers'), 'utf8');
    assert.doesNotMatch(headers, /ludus-catalog-text|\/core\/\*|\/loja\/\*/);
    assert.equal(await run(), 0);
    assert.equal(await readFile(join(root, '_headers'), 'utf8'), headers);
  } finally { await rm(root, { recursive: true, force: true }); }
});
