import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/scripts/orcamento-modelo.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { lerSelecao } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

test('orçamento recupera apenas SKUs atuais e quantidades inteiras válidas', () => {
  const codes = new Set(['LD-WH001', 'LD-A001']);
  for (const raw of [null, '{', 'null', '{}', JSON.stringify(Array(201).fill({}))]) assert.deepEqual(lerSelecao(raw, codes), []);
  const input = [null, {code:'LD-ARQUIVADO',quantidade:1}, {code:'LD-A001',quantidade:0}, {code:'LD-A001',quantidade:100}, {code:'LD-A001',quantidade:1.5}, {code:'LD-A001',quantidade:'2'}, {code:'LD-WH001',quantidade:2}, {code:'LD-WH001',quantidade:3}, {code:'LD-A001',quantidade:99}];
  assert.deepEqual(lerSelecao(JSON.stringify(input), codes), [{code:'LD-WH001',quantidade:3}, {code:'LD-A001',quantidade:99}]);
});
