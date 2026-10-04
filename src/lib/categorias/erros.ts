import type { ResultadoInserir, ResultadoRemover, ResultadoRenomear } from "@/lib/db/categorias";

import { type Motivo, type MotivoNome, mensagem } from "./mensagens";

// Rejeição de um id de categoria que não está na lista atual (FR-014, SC-006).
// Consumidores (003, IA) tratam por `instanceof`; a mensagem não traz o id nem dados do banco.
export class CategoriaInvalidaError extends Error {
  constructor() {
    super("Categoria inválida");
    this.name = "CategoriaInvalidaError";
  }
}

/** Falha mostrada no painel (contrato §3): `campo` indica o campo do formulário a destacar. */
export type Falha = { motivo: Motivo; mensagem: string; campo?: "nome" };

// Recusas da camada db (contrato §4): todo resultado de escrita que não é sucesso.
export type Recusa =
  | Exclude<ResultadoInserir | ResultadoRenomear, { tipo: "ok" }>
  | Exclude<ResultadoRemover, { tipo: "removido" }>;

export function falhaGeral(): Falha {
  return { motivo: "falha_geral", mensagem: mensagem("falha_geral") };
}

export function falhaDeNome(motivo: MotivoNome): Falha {
  return { motivo, mensagem: mensagem(motivo), campo: "nome" };
}

export function traduzirResultado(r: Recusa): Falha {
  switch (r.tipo) {
    case "nome_repetido":
      return {
        motivo: "nome_repetido",
        mensagem: mensagem("nome_repetido", { nome: r.nomeExistente }),
        campo: "nome",
      };
    case "ausente":
      return { motivo: "nao_existe", mensagem: mensagem("nao_existe") };
    case "versao_diferente":
      return { motivo: "alterada", mensagem: mensagem("alterada") };
    case "ultima":
      return { motivo: "ultima", mensagem: mensagem("ultima") };
    case "tem_produtos":
      // Quantidade ≤ 0: os produtos foram movidos entre a recusa e a contagem.
      if (r.quantidade < 1) return falhaGeral();
      return {
        motivo: "tem_produtos",
        mensagem: mensagem("tem_produtos", { quantidade: r.quantidade }),
      };
  }
}

// Qualquer exceção vira a mesma mensagem genérica: texto, host e usuário do banco nunca
// chegam ao painel.
export function traduzirExcecao(erro: unknown): Falha {
  void erro; // de propósito: nenhum dado do erro entra na falha
  return falhaGeral();
}
