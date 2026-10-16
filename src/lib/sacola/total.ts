// Valor da linha e subtotal (data-model §4, FR-012). Recebe só os itens ok; tudo em centavos
// inteiros (teto 15 × 10 × 9.999.999 < 2^53).

import { precoPublico } from "@/lib/catalogo/exibicao";
import { textos } from "./textos";

export type LinhaPedido = {
  quantidade: number;
  nome: string;
  codigo: string;
  precoCentavos: number | null;
  aPartirDe: boolean;
};

export function valorLinha(l: LinhaPedido): string {
  return precoPublico(l.precoCentavos === null ? null : l.quantidade * l.precoCentavos, l.aPartirDe);
}

export function resumo(linhas: LinhaPedido[]): { subtotal: string; aConsultar: string | null } {
  const comPreco = linhas.filter((l) => l.precoCentavos !== null);
  const semPreco = linhas.length - comPreco.length;
  const soma = comPreco.reduce((t, l) => t + l.quantidade * l.precoCentavos!, 0);
  return {
    subtotal: comPreco.length === 0 ? textos.consulteOValor : precoPublico(soma, comPreco.some((l) => l.aPartirDe)),
    aConsultar: semPreco === 0 ? null : textos.aConsultar(semPreco),
  };
}
