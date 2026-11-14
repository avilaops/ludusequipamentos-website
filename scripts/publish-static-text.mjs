import { publicarDiretorio } from '@avilaops/publicacao-texto/arquivos';
import { lstat, readFile, writeFile, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const temporary = '\n# ludus-catalog-text:temporario:inicio\n/core/*\n  X-Robots-Tag: noindex\n/loja/*\n  X-Robots-Tag: noindex\n# ludus-catalog-text:temporario:fim\n';

export async function publishStaticText(directory) {
  const root = resolve(directory);
  const info = await lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Diretório público inválido.');
  const path = join(root, '_headers');
  let original = '';
  let existed = false;
  try {
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Cabeçalhos não podem ser symlink.');
    original = await readFile(path, 'utf8');
    existed = true;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (original.includes('ludus-catalog-text:temporario:')) throw new Error('Filtro temporário anterior não foi restaurado.');
  await writeFile(path, original + temporary);
  try {
    // Mesmo motor do CLI: exclui catálogo e remove somente saídas antigas próprias.
    return await publicarDiretorio({ diretorio: root, origem: 'https://ludusequipamentos.com' });
  } finally {
    // O core remove whitespace inicial quando cria o primeiro bloco de headers.
    const headers = (await readFile(path, 'utf8')).replace(temporary, '').replace(temporary.trimStart(), '');
    if (!headers && !existed) await unlink(path);
    else await writeFile(path, headers);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { diretorio: { type: 'string', default: 'dist' } } });
  const result = await publishStaticText(values.diretorio);
  console.log(JSON.stringify({ paginas: result.paginas.length, ignoradas: result.ignoradas.length }));
}
