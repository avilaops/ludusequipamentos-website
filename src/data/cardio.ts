import catalogo from './cardio.json';
import type { Produto } from './site';

/** Ficha técnica de cada equipamento (potência, inclinação, console...), só com o que a planilha confirma. */
export type FichaCardio = Record<string, string>;
export type ProdutoCardio = Produto & { ficha: FichaCardio };

/** Nacionalizado: dados confirmados da planilha de cardio, sem valores comerciais nem fabricante. */
export const produtosCardio: ProdutoCardio[] = (catalogo as unknown as Omit<ProdutoCardio, 'colecao'>[])
  .map((produto) => ({ ...produto, colecao: 'cardio' as const }));
/** Na linha Cardio o agrupamento é por tipo de equipamento (o campo `grupo_muscular` guarda o tipo). */
export const gruposCardio = [
  { nome: 'Esteiras', slug: 'esteiras' },
  { nome: 'Bicicletas verticais', slug: 'bicicletas-verticais' },
  { nome: 'Bicicletas horizontais', slug: 'bicicletas-horizontais' },
  { nome: 'Bicicletas de spinning', slug: 'bicicletas-de-spinning' },
  { nome: 'Elípticos', slug: 'elipticos' },
  { nome: 'Simulador de escada', slug: 'simulador-de-escada' },
];
/**
 * Códigos Cardio cuja foto já está no R2 (`/midias/produtos/<código>`). Enquanto o código não estiver aqui,
 * o site mostra a miniatura do modelo 3D no lugar da foto, para não exibir imagem quebrada.
 */
export const cardioComFoto = new Set<string>();
