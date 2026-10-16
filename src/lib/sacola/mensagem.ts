// Mensagem do pedido e orçamento da URL do wa.me (contracts/sacola.md §4, research D3, ajuste A2).
// A observação entra inteira ou a função devolve "excede"; quem encolhe são os nomes, por igual.

import { OBSERVACAO_MAX, contarCaracteres, normalizarObservacao } from "./observacao";
import { resumo, valorLinha, type LinhaPedido } from "./total";
import { textos } from "./textos";

export const ORCAMENTO_URL = 1800;
export const NOME_MAX = 40;

type Entrada = { numero: string; linhas: LinhaPedido[]; observacao: string };

const BLOCO_OBSERVACAO = `\n\n${textos.observacao}\n`;

// Corte por code point (Array.from), nunca por índice UTF-16; sem reticências. O trimEnd evita o
// espaço duplo antes do código quando o corte termina num espaço.
function cortarNome(nome: string, limite: number): string {
  return Array.from(nome.trim()).slice(0, limite).join("").trimEnd();
}

function corpo(linhas: LinhaPedido[], limiteNome: number): string {
  const itens = linhas.map((l) => {
    const nome = cortarNome(l.nome, limiteNome);
    return `${l.quantidade}x ${nome === "" ? "" : `${nome} `}(#${l.codigo}) — ${valorLinha(l)}`;
  });
  const { subtotal, aConsultar } = resumo(linhas);
  const fim = [`${textos.subtotal} ${subtotal}`, ...(aConsultar === null ? [] : [aConsultar])];
  return [textos.cabecalhoPedido, ...itens, ...fim].join("\n");
}

function url(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

// Medida comum às três funções: a observação normalizada, seus code points, o tamanho codificado e
// o espaço que a URL deixa para ela com nomes em 0 (contando sempre o bloco "Observação:").
function medir(e: Entrada) {
  const observacao = normalizarObservacao(e.observacao);
  const codificada = encodeURIComponent(observacao).length;
  const espacoTotal = ORCAMENTO_URL - url(e.numero, corpo(e.linhas, 0) + BLOCO_OBSERVACAO).length;
  const pontos = contarCaracteres(observacao);
  return {
    observacao,
    codificada,
    espacoTotal,
    sobraCaracteres: OBSERVACAO_MAX - pontos,
    sobraUrl: espacoTotal - codificada,
    pontos,
  };
}

export function restanteObservacao(e: Entrada): number {
  const m = medir(e);
  return Math.min(m.sobraCaracteres, m.sobraUrl);
}

export function medidorObservacao(
  e: Entrada,
): { limite: "caracteres"; usados: number; maximo: 200 } | { limite: "mensagem"; fracao: number; excede: boolean } {
  const m = medir(e);
  if (m.sobraCaracteres <= m.sobraUrl) return { limite: "caracteres", usados: m.pontos, maximo: OBSERVACAO_MAX };
  const fracao = m.espacoTotal <= 0 ? 1 : Math.min(1, m.codificada / m.espacoTotal);
  return { limite: "mensagem", fracao, excede: m.sobraUrl < 0 };
}

export function montarPedido(e: Entrada): { tipo: "ok"; url: string; texto: string } | { tipo: "excede"; excesso: number } {
  const m = medir(e);
  const restante = Math.min(m.sobraCaracteres, m.sobraUrl);
  if (restante < 0) return { tipo: "excede", excesso: -restante };

  const sufixo = m.observacao === "" ? "" : BLOCO_OBSERVACAO + m.observacao;
  const texto = (limite: number) => corpo(e.linhas, limite) + sufixo;
  const cabe = (limite: number) => url(e.numero, texto(limite)).length <= ORCAMENTO_URL;

  // Maior L em [0, NOME_MAX] que cabe; L = 0 cabe porque restante >= 0. Função monotônica em L.
  let lo = 0;
  let hi = NOME_MAX;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (cabe(meio)) lo = meio;
    else hi = meio - 1;
  }
  const final = texto(lo);
  return { tipo: "ok", url: url(e.numero, final), texto: final };
}
