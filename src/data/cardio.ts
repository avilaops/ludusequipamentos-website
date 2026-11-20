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
 * Códigos Cardio com foto publicada. As fotos tratadas (produto recortado em fundo branco, 1536 × 1024) estão em
 * `public/fotos-cardio/<código>.webp` e saem com o próprio site. Quando forem para o R2 (`/midias/produtos/<código>`,
 * como as do Core e da Premium), basta trocar `fotoCardio` por esse caminho. Código fora do conjunto mostra "Foto em breve".
 */
export const cardioComFoto = new Set(produtosCardio.map((p) => p.code));
export const fotoCardio = (code: string) => `/fotos-cardio/${code}.webp`;
