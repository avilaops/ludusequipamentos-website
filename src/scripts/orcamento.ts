import { catalogo, urlProduto } from '../data/catalogo';
import { whatsapp } from '../data/site';
import { chaveOrcamento, lerSelecao } from './orcamento-modelo';

const produtos = new Map(catalogo.map(p => [p.code, p]));
// The edge inserts the reviewed ERP publication into this page; local data is the offline fallback.
try {
  const publication = JSON.parse(document.getElementById('catalogo-publicado')?.textContent ?? 'null');
  if (Array.isArray(publication?.products) && publication.products.length) {
    const active = new Set<string>();
    for (const p of publication.products) {
    const original = produtos.get(p.code);
      if (original) { produtos.set(p.code, { ...original, ...p }); active.add(p.code); }
    }
    for (const code of produtos.keys()) if (!active.has(code)) produtos.delete(code);
  }
} catch { /* A malformed publication must not break selection. */ }
const codigos = new Set(produtos.keys());
let itens = lerSelecao(null, codigos);
try { itens = lerSelecao(localStorage.getItem(chaveOrcamento), codigos); } catch { /* Selection still works in memory. */ }
const feedback = document.getElementById('orcamento-feedback');
const informar = (message: string) => { if (feedback) feedback.textContent = message; };
function salvar() {
  try { localStorage.setItem(chaveOrcamento, JSON.stringify(itens)); }
  catch { informar('A lista funciona nesta página, mas seu navegador não permitiu salvá-la.'); }
  atualizar();
}
function atualizar() {
  const total = itens.reduce((sum, item) => sum + item.quantidade, 0);
  document.querySelectorAll('[data-orcamento-contagem]').forEach(el => { el.textContent = String(total); });
  document.querySelectorAll<HTMLButtonElement>('[data-orcamento-add]').forEach(button => {
    const selected = itens.some(item => item.code === button.dataset.orcamentoAdd);
    button.textContent = selected ? 'Adicionado · ver orçamento' : 'Adicionar ao orçamento';
  });
  const container = document.getElementById('orcamento-itens');
  if (!container) return;
  container.replaceChildren();
  if (!itens.length) { const p = document.createElement('p'); p.textContent = 'Sua lista está vazia. Explore os equipamentos para começar.'; container.append(p); }
  for (const item of itens) {
    const p = produtos.get(item.code)!;
    const row = document.createElement('div'); row.className = 'orcamento-item';
    const img = document.createElement('img'); img.src = `/midias/produtos/${p.code}`; img.alt = p.nome;
    const description = document.createElement('div');
    const link = document.createElement('a'); link.href = urlProduto(p); link.textContent = p.nome;
    const detail = document.createElement('small'); detail.textContent = `${p.code} · Ludus ${p.colecao === 'core' ? 'Core' : 'Premium'}`;
    description.append(link, detail);
    const label = document.createElement('label'); label.textContent = 'Quantidade';
    const quantity = document.createElement('input'); quantity.type = 'number'; quantity.min = '1'; quantity.max = '99'; quantity.value = String(item.quantidade); quantity.setAttribute('aria-label', `Quantidade de ${p.nome}`);
    quantity.addEventListener('change', () => { const n = Number(quantity.value); if (!Number.isInteger(n) || n < 1 || n > 99) { quantity.value = String(item.quantidade); return; } item.quantidade = n; salvar(); });
    label.append(quantity);
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover'; remove.setAttribute('aria-label', `Remover ${p.nome}`);
    remove.addEventListener('click', () => { itens = itens.filter(i => i.code !== p.code); salvar(); });
    row.append(img, description, label, remove); container.append(row);
  }
  for (const id of ['orcamento-enviar', 'orcamento-copiar']) { const button = document.getElementById(id) as HTMLButtonElement | null; if (button) button.disabled = !itens.length; }
}
document.querySelectorAll<HTMLButtonElement>('[data-orcamento-add]').forEach(button => button.addEventListener('click', () => {
  const code = button.dataset.orcamentoAdd!;
  if (!codigos.has(code)) return;
  if (itens.some(item => item.code === code)) { location.assign('/orcamento/'); return; }
  itens.push({ code, quantidade: 1 }); salvar();
}));
function mensagem() {
  const notes = (document.getElementById('orcamento-observacoes') as HTMLTextAreaElement | null)?.value.trim() ?? '';
  return ['Olá! Quero uma proposta da Ludus para:', ...itens.map(item => { const p = produtos.get(item.code)!; return `${item.quantidade} × ${p.nome} (${p.code}) — ${p.colecao === 'core' ? 'Core' : 'Premium'}`; }), ...(notes ? ['', notes] : [])].join('\n');
}
document.getElementById('orcamento-enviar')?.addEventListener('click', () => {
  const url = whatsapp(mensagem());
  if (url.length > 7500) { informar('Sua seleção é extensa. Use “Copiar lista” e cole na conversa com a Ludus.'); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
});
document.getElementById('orcamento-copiar')?.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(mensagem()); informar('Lista copiada.'); }
  catch { informar('Não foi possível copiar. Verifique a permissão da área de transferência.'); }
});
window.addEventListener('storage', event => { if (event.key === chaveOrcamento) { itens = lerSelecao(event.newValue, codigos); atualizar(); } });
atualizar();
