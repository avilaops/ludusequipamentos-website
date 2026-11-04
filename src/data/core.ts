import catalogo from './core.json';
import type { Produto } from './site';

/** Nacional: dados confirmados da planilha, sem valores comerciais. */
export const produtosCore = catalogo as Produto[];
export const gruposCore = [
  { nome: 'Pernas e glúteos', slug: 'pernas-e-gluteos' },
  { nome: 'Peitoral', slug: 'peitoral' },
  { nome: 'Costas', slug: 'costas' },
  { nome: 'Ombros', slug: 'ombros' },
  { nome: 'Braços', slug: 'bracos' },
  { nome: 'Abdômen e lombar', slug: 'abdomen-e-lombar' },
  { nome: 'Multifuncionais', slug: 'multifuncionais' },
];
export const catalogoCore = 'https://drive.google.com/file/d/16v8UsmppZ7wegFcHQuF1tlO_DlPOhGaj/view';
export const areaNominal = (p: Produto) => p.dim[0] * p.dim[1] / 1_000_000;
