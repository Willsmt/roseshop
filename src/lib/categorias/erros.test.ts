import { describe, expect, it } from "vitest";

import { CategoriaInvalidaError, falhaDeNome, traduzirExcecao, traduzirResultado } from "./erros";
import { mensagem, type MotivoNome } from "./mensagens";

describe("CategoriaInvalidaError (existente)", () => {
  it("continua exportado e identificável por instanceof", () => {
    expect(new CategoriaInvalidaError()).toBeInstanceOf(Error);
  });
});

describe("traduzirResultado (contrato §4)", () => {
  it("nome_repetido ⇒ motivo, campo nome e nome existente na mensagem (US2-2)", () => {
    const f = traduzirResultado({ tipo: "nome_repetido", nomeExistente: "Bolsas" });
    expect(f).toEqual({
      motivo: "nome_repetido",
      mensagem: "Já existe uma categoria chamada Bolsas.",
      campo: "nome",
    });
  });

  it("ausente ⇒ nao_existe, sem campo (FR-019)", () => {
    const f = traduzirResultado({ tipo: "ausente" });
    expect(f.motivo).toBe("nao_existe");
    expect(f.mensagem).toBe(mensagem("nao_existe"));
    expect(f.campo).toBeUndefined();
  });

  it("versao_diferente ⇒ alterada", () => {
    const f = traduzirResultado({ tipo: "versao_diferente" });
    expect(f.motivo).toBe("alterada");
    expect(f.mensagem).toBe(mensagem("alterada"));
    expect(f.campo).toBeUndefined();
  });

  it("ultima ⇒ ultima", () => {
    const f = traduzirResultado({ tipo: "ultima" });
    expect(f.motivo).toBe("ultima");
    expect(f.mensagem).toBe(mensagem("ultima"));
  });

  it.each([3, 1])("tem_produtos com quantidade %d ⇒ tem_produtos com N", (quantidade) => {
    const f = traduzirResultado({ tipo: "tem_produtos", quantidade });
    expect(f.motivo).toBe("tem_produtos");
    expect(f.mensagem).toBe(mensagem("tem_produtos", { quantidade }));
    expect(f.mensagem).toContain(`tem ${quantidade} produto`);
  });

  it.each([0, -1])("tem_produtos com quantidade %d ⇒ falha_geral", (quantidade) => {
    const f = traduzirResultado({ tipo: "tem_produtos", quantidade });
    expect(f.motivo).toBe("falha_geral");
    expect(f.mensagem).toBe(mensagem("falha_geral"));
  });
});

describe("traduzirExcecao", () => {
  it("exceção desconhecida ⇒ falha_geral sem vazar host nem usuário", () => {
    const f = traduzirExcecao(
      new Error("connect ECONNREFUSED db.host user=neondb_owner password=x"),
    );
    expect(f).toEqual({ motivo: "falha_geral", mensagem: mensagem("falha_geral") });
    expect(f.campo).toBeUndefined();
    for (const vazado of ["ECONNREFUSED", "host", "neondb_owner", "password"]) {
      expect(f.mensagem).not.toContain(vazado);
    }
  });

  it("objeto com cause.code 23505 também ⇒ falha_geral", () => {
    const e = Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
    const f = traduzirExcecao(e);
    expect(f.motivo).toBe("falha_geral");
    expect(f.mensagem).not.toContain("23505");
  });

  it.each([null, undefined, "x", 42])("valor não-Error (%o) ⇒ falha_geral", (e) => {
    expect(traduzirExcecao(e).motivo).toBe("falha_geral");
  });
});

describe("falhaDeNome", () => {
  it.each(["nome_vazio", "nome_tamanho", "nome_caracteres", "nome_sem_letra"] as MotivoNome[])(
    "%s ⇒ mensagem do motivo e campo nome",
    (motivo) => {
      expect(falhaDeNome(motivo)).toEqual({ motivo, mensagem: mensagem(motivo), campo: "nome" });
    },
  );
});
