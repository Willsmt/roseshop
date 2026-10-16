// Regra única da observação (FR-015a, research D2): campo, contador e mensagem importam daqui.

export const OBSERVACAO_MAX = 200;

// Controle exceto LF (U+000A).
const CONTROLE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
// Invisíveis e de direção. U+200D (ZWJ), U+FE0E e U+FE0F ficam: compõem emoji.
const INVISIVEIS = /[​‌‎‏‪-‮⁠⁦-⁩﻿]/g;
// Surrogate sem par (com a flag u, um par válido é um só code point e não casa): sem isto o
// encodeURIComponent da mensagem lança URIError.
const SURROGATE_SOLTO = /[\uD800-\uDFFF]/gu;

export function normalizarObservacao(bruto: string): string {
  return bruto
    .replace(/\r\n?/g, "\n")
    .replace(SURROGATE_SOLTO, "")
    .normalize("NFC")
    .replace(CONTROLE, "")
    .replace(INVISIVEIS, "")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

// Code points, não unidades UTF-16.
export function contarCaracteres(texto: string): number {
  return [...texto].length;
}
