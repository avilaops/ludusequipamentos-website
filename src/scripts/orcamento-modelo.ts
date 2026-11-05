export type ItemOrcamento = { code: string; quantidade: number };
export const chaveOrcamento = 'ludus:orcamento:v1';

/** Stored selections are untrusted; product identity always comes from the catalog. */
export function lerSelecao(raw: string | null, codigos: Set<string>): ItemOrcamento[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value) || value.length > 200) return [];
    const itens = new Map<string, number>();
    for (const item of value) {
      if (!item || typeof item.code !== 'string' || !codigos.has(item.code)
        || !Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99) continue;
      itens.set(item.code, item.quantidade);
    }
    return [...itens].map(([code, quantidade]) => ({ code, quantidade }));
  } catch { return []; }
}
