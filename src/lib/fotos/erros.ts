import type { MotivoVerificacao } from "@/lib/r2";

import { mensagemFoto } from "./mensagens";
import type { Conjunto, FalhaFoto, MotivoFoto } from "./tipos";

// Falha devolvida pelas actions de fotos (contracts/fotos.md §3). Só `import type` do r2:
// continua seguro para o client.

export function falhaFoto(motivo: MotivoFoto, atual?: Conjunto): FalhaFoto {
  const falha: FalhaFoto = { motivo, mensagem: mensagemFoto(motivo) };
  return atual ? { ...falha, atual } : falha;
}

const DA_VERIFICACAO: Record<MotivoVerificacao, MotivoFoto> = {
  formato: "formato",
  metadado: "nao_passou",
  animada: "nao_passou",
  corrompida: "nao_passou",
  dimensao: "nao_passou",
  pequena: "pequena",
};

export function motivoDaVerificacao(motivo: MotivoVerificacao): MotivoFoto {
  return DA_VERIFICACAO[motivo];
}
