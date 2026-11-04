import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) throw new Error('Informe a pasta com as fotos aprovadas <codigo>-ludus.png.');
const products = JSON.parse(await readFile(new URL('../src/data/core.json', import.meta.url), 'utf8'));
const destination = new URL('../src/assets/core/', import.meta.url);
await mkdir(destination, { recursive: true });
for (const product of products) {
  await sharp(resolve(source, `${product.code}-ludus.png`))
    .resize({ width: 1400, withoutEnlargement: true })
    .webp({ quality: 90 })
    .toFile(fileURLToPath(new URL(`${product.code}.webp`, destination)));
}
console.log(`${products.length} fotos Core preparadas para o site.`);
