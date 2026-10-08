import { describe, expect, it } from "vitest";

import { falhaDoResultado } from "./erros";
import { mensagemDoMotivo } from "./mensagens";

// T015 / contrato §2 (resultados da camada SQL) e §6 (motivos).

describe("falhaDoResultado", () => {
  it("ausente ⇒ nao_existe, sem campo", () => {
    const f = falhaDoResultado({ tipo: "ausente" });
    expect(f).toEqual({ motivo: "nao_existe", mensagem: mensagemDoMotivo("nao_existe") });
    expect(f.campo).toBeUndefined();
  });

  it("versao_diferente ⇒ alterado", () => {
    const f = falhaDoResultado({ tipo: "versao_diferente" });
    expect(f.motivo).toBe("alterado");
    expect(f.mensagem).toBe(mensagemDoMotivo("alterado"));
    expect(f.campo).toBeUndefined();
  });

  it.each([
    ["limite", "limite_destaques"],
    ["vaga_disputada", "vaga_disputada"],
    ["esgotado", "esgotado_nao_destaca"],
    ["ja_em_destaque", "ja_em_destaque"],
  ] as const)("%s ⇒ %s, sem campo", (tipo, motivo) => {
    const f = falhaDoResultado({ tipo });
    expect(f.motivo).toBe(motivo);
    expect(f.mensagem).toBe(mensagemDoMotivo(motivo));
    expect(f.campo).toBeUndefined();
  });

  it("categoria_ausente ⇒ categoria_invalida com campo categoria", () => {
    expect(falhaDoResultado({ tipo: "categoria_ausente" })).toEqual({
      motivo: "categoria_invalida",
      mensagem: mensagemDoMotivo("categoria_invalida"),
      campo: "categoria",
    });
  });

  it("nome_repetido com codigoExistente ⇒ campo nome, código na falha e na mensagem", () => {
    expect(falhaDoResultado({ tipo: "nome_repetido", codigoExistente: 42 })).toEqual({
      motivo: "nome_repetido",
      mensagem: "Já existe um produto com esse nome: #0042.",
      campo: "nome",
      codigoExistente: 42,
    });
  });

  it("nome_repetido sem codigoExistente ⇒ sem a chave codigoExistente", () => {
    const f = falhaDoResultado({ tipo: "nome_repetido" });
    expect(f).toEqual({
      motivo: "nome_repetido",
      mensagem: "Já existe um produto com esse nome.",
      campo: "nome",
    });
    expect(f).not.toHaveProperty("codigoExistente");
  });
});
