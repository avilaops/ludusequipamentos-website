import { produtos, type Produto } from './site';
import { produtosCore } from './core';

export const colecoes = [
  { id: 'premium', nome: 'Linha Premium', href: '/loja/premium/' },
  { id: 'core', nome: 'Linha Core', href: '/loja/core/' },
] as const;
export const catalogo: Produto[] = [...produtos, ...produtosCore];
export const selecionarColecao = (colecao?: Produto['colecao']) =>
  colecao ? catalogo.filter((produto) => produto.colecao === colecao) : catalogo;
/** URLs de fichas preservadas: já constam nos QR codes dos catálogos. */
export const urlProduto = (produto: Produto) =>
  produto.colecao === 'core' ? `/core/${produto.slug}/` : `/loja/${produto.slug}/`;
