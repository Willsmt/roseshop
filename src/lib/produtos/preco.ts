// Entrada e formatação do preço (research D8, contrato §4). Tudo em inteiros: nenhuma
// conversão passa por float.

export type ResultadoPreco =
  | { ok: true; centavos: number }
  | { ok: false; motivo: "preco_invalido" | "preco_ambiguo" };

const MAX_CENTAVOS = 9_999_999; // 99.999,99

const invalido = { ok: false, motivo: "preco_invalido" } as const;
const ambiguo = { ok: false, motivo: "preco_ambiguo" } as const;

function emCentavos(reais: string, centavos: string): ResultadoPreco {
  const total = Number(reais) * 100 + Number(centavos.padEnd(2, "0"));
  if (total < 1 || total > MAX_CENTAVOS) return invalido;
  return { ok: true, centavos: total };
}

export function parsePreco(texto: string): ResultadoPreco {
  // "R$" só vale como prefixo; em outra posição sobra no texto e cai em preco_invalido.
  const semMoeda = texto.trim().replace(/^R\$/, "").trim();
  // Espaço entre dígitos ("12 90") não tem leitura segura: pode ser reais e centavos.
  if (/\d\s+\d/.test(semMoeda)) return ambiguo;
  const t = semMoeda.replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(t)) return invalido;

  // Sem separador: reais inteiros.
  if (/^\d{1,9}$/.test(t)) return emCentavos(t, "");

  // pt-BR completo: milhar com ".", decimal opcional com ",".
  const ptBr = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(t);
  if (ptBr) {
    // "1.290" sem decimal e com um só grupo é o caso ambíguo (milhar ou decimal?).
    if (ptBr[2] === undefined && ptBr[1].split(".").length === 2) return ambiguo;
    return emCentavos(ptBr[1].replaceAll(".", ""), ptBr[2] ?? "");
  }

  // Um único separador (`,` ou `.`).
  const um = /^(\d{1,9})[.,](\d+)$/.exec(t);
  if (um && !/[.,].*[.,]/.test(t)) {
    if (um[2].length === 3) return ambiguo;
    if (um[2].length <= 2) return emCentavos(um[1], um[2]);
  }
  return invalido;
}

function agrupar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatarPreco(centavos: number): string {
  const reais = Math.floor(centavos / 100);
  const resto = String(centavos % 100).padStart(2, "0");
  return `R$ ${agrupar(String(reais))},${resto}`;
}

export function formatarAPartirDe(centavos: number): string {
  return `a partir de ${formatarPreco(centavos)}`;
}
