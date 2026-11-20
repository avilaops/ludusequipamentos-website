/**
 * Troca só o código do Worker `ludus-catalog-media`, sem tocar em bindings (R2), rotas nem no segredo PUBLISH_TOKEN
 * (API "Replace Worker Script Content" da Cloudflare).
 *
 * Por padrão é um ENSAIO: gera o pacote, baixa o código implantado, compara e mostra o que mudaria. Nada é gravado.
 * Para gravar de verdade, acrescente --aplicar.
 *
 *   CLOUDFLARE_TOKEN=<token com Workers Scripts: Edit> node scripts/implantar-worker.mjs
 *   CLOUDFLARE_TOKEN=... node scripts/implantar-worker.mjs --aplicar
 *
 * CLOUDFLARE_ACCOUNT_ID é opcional: sem ele, usa a conta do token se houver exatamente uma.
 */
import { createHash } from 'node:crypto';
import { catalogWorkerBundle } from './build-catalog-worker.mjs';

const NOME = 'ludus-catalog-media';
const aplicar = process.argv.includes('--aplicar');
const token = process.env.CLOUDFLARE_TOKEN;
const hash = (texto) => createHash('sha256').update(texto).digest('hex').slice(0, 16);

const novo = await catalogWorkerBundle();
console.log(`Pacote novo: ${novo.length} caracteres, sha256 ${hash(novo)}`);
if (!token) {
  console.log('Sem CLOUDFLARE_TOKEN: só o pacote foi gerado. Informe o token para comparar com o Worker implantado.');
  process.exit(0);
}

const api = async (caminho, init = {}) => {
  const resposta = await fetch(`https://api.cloudflare.com/client/v4${caminho}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  if (!resposta.ok) throw new Error(`${init.method ?? 'GET'} ${caminho} → ${resposta.status} ${(await resposta.text()).slice(0, 300)}`);
  return resposta;
};
let conta = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!conta) {
  const contas = (await (await api('/accounts')).json()).result ?? [];
  if (contas.length !== 1) throw new Error(`Informe CLOUDFLARE_ACCOUNT_ID: o token enxerga ${contas.length} conta(s).`);
  conta = contas[0].id;
}
const caminho = `/accounts/${conta}/workers/scripts/${NOME}`;

/** O código vem num multipart: separa a fronteira, os cabeçalhos e o corpo. */
const lerImplantado = async () => {
  const bruto = await (await api(`${caminho}/content/v2`)).text();
  const fronteira = bruto.slice(0, bruto.indexOf('\r\n'));
  return bruto.slice(bruto.indexOf('\r\n\r\n') + 4, bruto.lastIndexOf(`\r\n${fronteira}`));
};

const atual = await lerImplantado();
console.log(`Implantado:  ${atual.length} caracteres, sha256 ${hash(atual)}`);
if (atual === novo) {
  console.log('O Worker implantado já é igual ao pacote novo. Nada a fazer.');
  process.exit(0);
}
console.log(`Diferença: ${novo.length - atual.length} caracteres.`);
if (!aplicar) {
  console.log('ENSAIO: nada foi gravado. Rode de novo com --aplicar para trocar o código.');
  process.exit(0);
}

const formulario = new FormData();
formulario.append('catalog-media.mjs', new Blob([novo], { type: 'application/javascript+module' }), 'catalog-media.mjs');
await api(`${caminho}/content`, { method: 'PUT', headers: { 'CF-WORKER-MAIN-MODULE-PART': 'catalog-media.mjs' }, body: formulario });
const depois = await lerImplantado();
console.log(depois === novo ? `Implantado e conferido (sha256 ${hash(depois)}).` : `ATENÇÃO: o código lido depois (${hash(depois)}) difere do enviado (${hash(novo)}).`);
process.exit(depois === novo ? 0 : 1);
