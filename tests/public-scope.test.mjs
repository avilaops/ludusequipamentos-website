import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const productRoot = new URL('../dist/loja/', import.meta.url);
const removedSlugs = [
  'panturrilha-em-pe-ld-b010',
  'quadril-e-gluteos-maquina-ld-b011',
  'agachamento-v-squat-ld-b034',
];
const removedCodes = ['LD-B010', 'LD-B011', 'LD-B034'];

function htmlFiles(directory) {
  return readdirSync(directory, { recursive: true })
    .filter((path) => path.endsWith('.html'))
    .map((path) => new URL(path, directory));
}

test('removes the three out-of-scope products from the generated catalog', () => {
  for (const slug of removedSlugs) {
    assert.equal(existsSync(new URL(`${slug}/index.html`, productRoot)), false, slug);
  }

  const productPages = readdirSync(productRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/index.html`, productRoot)));
  assert.equal(productPages.length, 91);

  const publicDocuments = [
    ...htmlFiles(new URL('../dist/', import.meta.url)),
    ...readdirSync(new URL('../dist/', import.meta.url), { recursive: true })
      .filter((path) => path.endsWith('.xml'))
      .map((path) => new URL(path, new URL('../dist/', import.meta.url))),
  ];
  for (const file of publicDocuments) {
    const content = readFileSync(file, 'utf8');
    for (const code of removedCodes) assert.doesNotMatch(content, new RegExp(code, 'i'), `${file.pathname}: ${code}`);
    for (const slug of removedSlugs) assert.doesNotMatch(content, new RegExp(slug, 'i'), `${file.pathname}: ${slug}`);
  }
});

test('does not expose 3D or augmented-reality controls in public HTML', () => {
  const forbidden = [
    /Ver em 3D/i,
    /modelo 3D/i,
    /em cada produto/i,
    /data-aba="3d"/i,
    /data-modo="3d"/i,
    /Ver no meu espaço \(AR\)/i,
    /class="b3d"/i,
  ];

  for (const file of htmlFiles(new URL('../dist/', import.meta.url))) {
    const html = readFileSync(file, 'utf8');
    for (const pattern of forbidden) assert.doesNotMatch(html, pattern, `${file.pathname}: ${pattern}`);
  }
});

test('publishes the supplied Ludus logo and symbol favicon', () => {
  const home = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

  assert.match(home, /ludus-retangular[^"']*\.webp/);
  assert.match(home, /<link rel="icon" type="image\/png" href="\/favicon-32x32\.png"/);
  assert.match(home, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.equal(existsSync(new URL('../dist/favicon-32x32.png', import.meta.url)), true);
  assert.equal(existsSync(new URL('../dist/apple-touch-icon.png', import.meta.url)), true);
});

test('does not publish unconfirmed information', () => {
  for (const file of htmlFiles(new URL('../dist/', import.meta.url))) {
    const html = readFileSync(file, 'utf8');
    assert.doesNotMatch(html, /a confirmar/i, file.pathname);
  }
});
