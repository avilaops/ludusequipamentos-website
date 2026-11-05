import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test } from 'node:test';

test('both catalogs link to R2 delivery without duplicating PDFs in the site bundle', () => {
  for (const page of ['index.html', 'catalogos/index.html']) {
    const html = readFileSync(new URL(`../dist/${page}`, import.meta.url), 'utf8');
    for (const line of ['core', 'premium']) {
      assert.ok(html.includes(`href="/catalogos/ludus-${line}.pdf"`));
      assert.ok(html.includes(`Pedir orçamento da Linha ${line === 'core' ? 'Core' : 'Premium'}`));
      assert.ok(html.includes(`Capa do catálogo Ludus ${line === 'core' ? 'Core' : 'Premium'}`));
    }
  }
  for (const line of ['core', 'premium']) {
    assert.equal(existsSync(new URL(`../dist/catalogos/ludus-${line}.pdf`, import.meta.url)), false);
  }
});
