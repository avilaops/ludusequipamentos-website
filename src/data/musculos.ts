/**
 * Músculos trabalhados, pelo tipo de exercício do equipamento.
 *
 * A base de produtos só traz o grupo muscular. O detalhamento abaixo é o da
 * biomecânica de cada exercício (o mesmo de qualquer manual de musculação), e
 * usa o mecanismo que o gerador 3D atribuiu a cada equipamento. Equipamento sem
 * mecanismo conhecido mostra só o grupo do catálogo. A tabela fica no gerador
 * (catalogs/ludus/musculos.json), a mesma que o catálogo em PDF usa.
 */
import tabela from '@avilaops/gerador-3d/catalogs/ludus/musculos.json';
import { spec } from './modelos';
import type { Produto } from './site';

interface Musculos {
  principais: string[];
  auxiliares: string[];
}

const POR_MECANISMO: Record<string, Musculos> = tabela.porMecanismo;
/** Exceções por código, onde o exercício difere do tipo do mecanismo. */
const POR_CODIGO: Record<string, Musculos> = tabela.porCodigo;

export function musculos(p: Produto): Musculos | null {
  if (POR_CODIGO[p.code]) return POR_CODIGO[p.code];
  const params = (spec(p.code)?.params ?? {}) as Record<string, unknown>;
  const chave = String(params.mechanism ?? params.variant ?? '');
  // Bancos, suportes e estações de cabo servem a vários exercícios: fica o grupo do catálogo.
  return POR_MECANISMO[chave] ?? null;
}
