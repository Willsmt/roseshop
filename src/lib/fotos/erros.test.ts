import { describe, expect, it } from "vitest";
import { falhaFoto, motivoDaVerificacao } from "./erros";
import { mensagemFoto } from "./mensagens";
import type { Conjunto, MotivoFoto } from "./tipos";

// Feature 004, T062: falhaFoto e mapeamento dos motivos da verificação (F§3, §8).

describe("motivoDaVerificacao", () => {
  it.each([
    ["formato", "formato"],
    ["metadado", "nao_passou"],
    ["animada", "nao_passou"],
    ["corrompida", "nao_passou"],
    ["dimensao", "nao_passou"],
    ["pequena", "pequena"],
  ] as const)("%s ⇒ %s", (entrada, esperado) => {
    expect(motivoDaVerificacao(entrada)).toBe(esperado);
  });
});

describe("falhaFoto", () => {
  it.each(["formato", "grande", "nao_enviada", "sem_foto", "muitos_pendentes", "falha_geral"] as MotivoFoto[])(
    "%s: mensagem = mensagemFoto e sem atual",
    (motivo) => {
      const f = falhaFoto(motivo);
      expect(f).toEqual({ motivo, mensagem: mensagemFoto(motivo) });
      expect("atual" in f).toBe(false);
    },
  );

  it("inclui o conjunto atual quando informado", () => {
    const atual: Conjunto = {
      fotosVersao: 3,
      fotos: [{ posicao: 1, arquivo: "a.webp", url: "/painel/fotos/a.webp" }],
    };
    expect(falhaFoto("alterado", atual)).toEqual({
      motivo: "alterado",
      mensagem: mensagemFoto("alterado"),
      atual,
    });
  });
});
