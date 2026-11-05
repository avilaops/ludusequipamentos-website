import { produtos, type Produto } from './site';
import { produtosCore } from './core';

export const colecoes = [
  { id: 'premium', nome: 'Linha Premium', href: '/loja/premium/' },
  { id: 'core', nome: 'Linha Core', href: '/loja/core/' },
] as const;
// Alterna as coleções na visão geral para que ambas apareçam desde a primeira linha.
export const catalogo: Produto[] = Array.from(
  { length: Math.max(produtos.length, produtosCore.length) },
  (_, index) => [produtosCore[index], produtos[index]].filter((produto): produto is Produto => Boolean(produto)),
).flat();
export const selecionarColecao = (colecao?: Produto['colecao']) =>
  colecao ? catalogo.filter((produto) => produto.colecao === colecao) : catalogo;
/** URLs de fichas preservadas: já constam nos QR codes dos catálogos. */
export const urlProduto = (produto: Produto) =>
  produto.url ?? (produto.colecao === 'core' ? `/core/${produto.slug}/` : `/loja/${produto.slug}/`);

/** Nomes equivalentes de navegação; as fichas técnicas preservam a classificação original. */
const nomesDeGrupo: Record<string, string> = {
  Deltoides: 'Ombros',
  Abdômen: 'Abdômen e lombar',
  Multitrabalho: 'Multifuncionais',
};
export const grupoCatalogo = (produto: Produto) => nomesDeGrupo[produto.grupo_muscular] ?? produto.grupo_muscular;
