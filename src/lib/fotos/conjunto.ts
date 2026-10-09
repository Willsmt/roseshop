import type { FotoLinha } from "@/lib/db/fotos";

// Regra pura do conjunto de fotos (contracts/fotos.md §3, FR-003, FR-025): calcula a lista final
// de cada ação ou a recusa, sem I/O. Nunca 0 nem mais de 3 fotos; posições sempre 1..n.

export const MAXIMO_FOTOS = 3;

export type NovaFoto = Omit<FotoLinha, "posicao">;

export type AcaoConjunto =
  | { tipo: "adicionar"; nova: NovaFoto }
  | { tipo: "trocar"; posicao: number; nova: NovaFoto }
  | { tipo: "remover"; posicao: number }
  | { tipo: "mover"; de: number; para: number };

export type ResultadoRegra =
  | { ok: true; novas: FotoLinha[]; saiu?: string } // saiu: chave que deixou o conjunto
  | { ok: false; motivo: "limite" | "ultima" | "falha_geral" };

const FALHA = { ok: false, motivo: "falha_geral" } as const;

function numerar(fotos: NovaFoto[]): FotoLinha[] {
  return fotos.map((f, i) => ({
    posicao: i + 1,
    chave: f.chave,
    enviadoPor: f.enviadoPor,
    enviadoEm: f.enviadoEm,
  }));
}

export function aplicarAcao(atuais: FotoLinha[], acao: AcaoConjunto): ResultadoRegra {
  const existe = (p: number) => Number.isInteger(p) && p >= 1 && p <= atuais.length;
  const repetida = (nova: NovaFoto) => atuais.some((f) => f.chave === nova.chave);

  switch (acao.tipo) {
    case "adicionar":
      if (atuais.length >= MAXIMO_FOTOS) return { ok: false, motivo: "limite" };
      if (repetida(acao.nova)) return FALHA;
      return { ok: true, novas: numerar([...atuais, acao.nova]) };
    case "trocar": {
      if (!existe(acao.posicao) || repetida(acao.nova)) return FALHA;
      const i = acao.posicao - 1;
      return {
        ok: true,
        novas: numerar(atuais.map((f, j) => (j === i ? acao.nova : f))),
        saiu: atuais[i].chave,
      };
    }
    case "remover": {
      if (!existe(acao.posicao)) return FALHA;
      if (atuais.length === 1) return { ok: false, motivo: "ultima" };
      const i = acao.posicao - 1;
      return { ok: true, novas: numerar(atuais.filter((_, j) => j !== i)), saiu: atuais[i].chave };
    }
    case "mover": {
      if (!existe(acao.de) || !existe(acao.para) || acao.de === acao.para) return FALHA;
      const lista = [...atuais];
      const [movida] = lista.splice(acao.de - 1, 1);
      lista.splice(acao.para - 1, 0, movida);
      return { ok: true, novas: numerar(lista) };
    }
  }
}
