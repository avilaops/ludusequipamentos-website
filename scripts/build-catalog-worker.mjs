import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function catalogWorkerBundle() {
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../workers/catalog-media.mjs', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
  });
  // Resolver variantes de servidor evita módulos browser que dependem de document.
  return result.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await mkdir(new URL('../.worker-build/', import.meta.url), { recursive: true });
  await writeFile(new URL('../.worker-build/catalog-media.mjs', import.meta.url), await catalogWorkerBundle());
}
