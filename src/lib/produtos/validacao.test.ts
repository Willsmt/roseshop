import { describe, expect, it, vi } from "vitest";

// O barrel real de categorias (D5) importa o banco; só o contexto do banco é
// mockado para o unitário não depender de rede nem de banco.
vi.mock("@/lib/db/contexto", () => ({ dbDoContexto: vi.fn() }));

import { normalizarNome } from "@/lib/categorias";

import { validarCamposProduto } from "./validacao";

// T014 / contrato §3 (ordem de validação, modos) / research D5, D8, D10.

const base = { nome: "Meia soquete", categoriaId: "3" };

function campos(r: ReturnType<typeof validarCamposProduto>) {
  if (!r.ok) throw new Error(`esperava ok, veio ${JSON.stringify(r.falhas)}`);
  return r.campos;
}
function falhas(r: ReturnType<typeof validarCamposProduto>) {
  if (r.ok) throw new Error("esperava falhas, veio ok");
  return r.falhas;
}
const motivos = (r: ReturnType<typeof validarCamposProduto>) => falhas(r).map((f) => f.motivo);

describe("sucesso mínimo", () => {
  it("cadastro com nome e categoria ⇒ campos normalizados, sem preço", () => {
    const r = validarCamposProduto(base, "cadastro");
    expect(r.ok).toBe(true);
    expect(campos(r)).toEqual({
      nome: "Meia soquete",
      categoriaId: 3,
      descricao: null,
      precoCentavos: null,
      aPartirDe: false,
    });
  });

  it("cadastro com preço e a partir de ⇒ centavos e flag", () => {
    const c = campos(validarCamposProduto({ ...base, preco: "R$ 12,90", aPartirDe: true }, "cadastro"));
    expect(c.precoCentavos).toBe(1290);
    expect(c.aPartirDe).toBe(true);
  });

  it("preço vazio ou só espaços ⇒ precoCentavos null", () => {
    expect(campos(validarCamposProduto({ ...base, preco: "" }, "cadastro")).precoCentavos).toBeNull();
    expect(campos(validarCamposProduto({ ...base, preco: "   " }, "cadastro")).precoCentavos).toBeNull();
  });
});

describe("nome (D10.1)", () => {
  it("usa normalizarNome: trim, colapso de espaços e NFC", () => {
    const entrada = "  Meia   soqueté  ";
    const c = campos(validarCamposProduto({ ...base, nome: entrada }, "cadastro"));
    expect(c.nome).toBe(normalizarNome(entrada));
    expect(c.nome).toBe("Meia soqueté");
  });

  it.each(["", "   ", undefined])("%j ⇒ nome_vazio no campo nome", (nome) => {
    const f = falhas(validarCamposProduto({ ...base, nome }, "cadastro"));
    expect(f[0]).toMatchObject({ motivo: "nome_vazio", campo: "nome" });
    expect(f[0].mensagem).toBe("Escreva o nome do produto.");
  });

  it("2 code points ⇒ nome_tamanho; 3 ⇒ ok", () => {
    expect(falhas(validarCamposProduto({ ...base, nome: "ab" }, "cadastro"))[0]).toMatchObject({
      motivo: "nome_tamanho",
      campo: "nome",
    });
    expect(validarCamposProduto({ ...base, nome: "abc" }, "cadastro").ok).toBe(true);
  });

  it("80 code points ⇒ ok; 81 ⇒ nome_tamanho", () => {
    expect(validarCamposProduto({ ...base, nome: "a".repeat(80) }, "cadastro").ok).toBe(true);
    expect(motivos(validarCamposProduto({ ...base, nome: "a".repeat(81) }, "cadastro"))).toEqual([
      "nome_tamanho",
    ]);
  });

  it("emoji conta 1 code point (80 no total ⇒ ok; 81 ⇒ tamanho)", () => {
    expect(validarCamposProduto({ ...base, nome: "a" + "😀".repeat(79) }, "cadastro").ok).toBe(true);
    expect(motivos(validarCamposProduto({ ...base, nome: "a" + "😀".repeat(80) }, "cadastro"))).toEqual([
      "nome_tamanho",
    ]);
  });

  it("letra com acento decomposto conta 1 depois de normalizar", () => {
    // "éab" ⇒ "éab" (3) ok; "éa" ⇒ "éa" (2) tamanho
    expect(validarCamposProduto({ ...base, nome: "éab" }, "cadastro").ok).toBe(true);
    expect(motivos(validarCamposProduto({ ...base, nome: "éa" }, "cadastro"))).toEqual([
      "nome_tamanho",
    ]);
  });

  it("só símbolos ou sem letra nem dígito ⇒ nome_invalido", () => {
    for (const nome of ["!!!", "😀😀😀", "---", "***"]) {
      expect(falhas(validarCamposProduto({ ...base, nome }, "cadastro"))[0]).toMatchObject({
        motivo: "nome_invalido",
        campo: "nome",
      });
    }
  });

  it("só dígitos é aceito", () => {
    expect(validarCamposProduto({ ...base, nome: "123" }, "cadastro").ok).toBe(true);
  });

  it("caracteres de controle ⇒ nome_invalido", () => {
    for (const nome of ["Meia\u0007soquete", "Meia\u0000soquete", "Meia\tsoquete\u001b"]) {
      expect(motivos(validarCamposProduto({ ...base, nome }, "cadastro"))).toEqual(["nome_invalido"]);
    }
  });

  it("caracteres de formatação invisível (Cf) ⇒ nome_invalido", () => {
    for (const nome of ["Meia\u200Bsoquete", "Meia soquete\u202E", "Meia\u2060soquete"]) {
      expect(motivos(validarCamposProduto({ ...base, nome }, "cadastro"))).toEqual(["nome_invalido"]);
    }
  });

  it("tab no meio vira espaço pela normalização e é aceito", () => {
    expect(campos(validarCamposProduto({ ...base, nome: "Meia\tsoquete" }, "cadastro")).nome).toBe(
      "Meia soquete",
    );
  });

  it("demais caracteres são livres (&, /, parênteses)", () => {
    expect(campos(validarCamposProduto({ ...base, nome: "Kit P&M (3/4)" }, "cadastro")).nome).toBe(
      "Kit P&M (3/4)",
    );
  });
});

describe("categoria (forma apenas)", () => {
  it.each(["", "  ", undefined, null])("%j ⇒ categoria_obrigatoria no campo categoria", (categoriaId) => {
    const f = falhas(validarCamposProduto({ ...base, categoriaId }, "cadastro"));
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ motivo: "categoria_obrigatoria", campo: "categoria" });
    expect(f[0].mensagem).toBe("Escolha uma categoria.");
  });

  it.each(["abc", "03", " 3", "3 ", "0", "-1", "1e2", "1.5", "2147483648", "99999999999"])(
    "%j ⇒ categoria_invalida",
    (categoriaId) => {
      expect(falhas(validarCamposProduto({ ...base, categoriaId }, "cadastro"))[0]).toMatchObject({
        motivo: "categoria_invalida",
        campo: "categoria",
      });
    },
  );

  it.each([
    ["1", 1],
    ["2147483647", 2147483647],
    [7, 7],
  ])("%j ⇒ ok com %d", (categoriaId, esperado) => {
    expect(campos(validarCamposProduto({ ...base, categoriaId }, "cadastro")).categoriaId).toBe(esperado);
  });
});

describe("descrição (D10.2)", () => {
  it("ausente, vazia ou só espaços ⇒ null", () => {
    for (const descricao of [undefined, "", "   \n  "]) {
      expect(campos(validarCamposProduto({ ...base, descricao }, "cadastro")).descricao).toBeNull();
    }
  });

  it("\\r\\n ⇒ \\n e trim nas pontas", () => {
    const c = campos(
      validarCamposProduto({ ...base, descricao: "  linha 1\r\nlinha 2\r\n  " }, "cadastro"),
    );
    expect(c.descricao).toBe("linha 1\nlinha 2");
  });

  it("1000 code points ⇒ ok; 1001 ⇒ descricao_tamanho", () => {
    expect(validarCamposProduto({ ...base, descricao: "a".repeat(1000) }, "cadastro").ok).toBe(true);
    const f = falhas(validarCamposProduto({ ...base, descricao: "a".repeat(1001) }, "cadastro"));
    expect(f[0]).toMatchObject({ motivo: "descricao_tamanho", campo: "descricao" });
  });

  it("emoji conta 1 code point", () => {
    expect(validarCamposProduto({ ...base, descricao: "😀".repeat(1000) }, "cadastro").ok).toBe(true);
    expect(motivos(validarCamposProduto({ ...base, descricao: "😀".repeat(1001) }, "cadastro"))).toEqual([
      "descricao_tamanho",
    ]);
  });
});

describe("preço (D8)", () => {
  it("espaço entre dígitos ⇒ preco_ambiguo", () => {
    expect(falhas(validarCamposProduto({ ...base, preco: "12 90" }, "cadastro"))[0]).toMatchObject({
      motivo: "preco_ambiguo",
      campo: "preco",
    });
  });

  it("preço inválido ⇒ preco_invalido no campo preco", () => {
    expect(falhas(validarCamposProduto({ ...base, preco: "abc" }, "cadastro"))[0]).toMatchObject({
      motivo: "preco_invalido",
      campo: "preco",
    });
  });

  it("preço ambíguo ⇒ preco_ambiguo no campo preco", () => {
    expect(falhas(validarCamposProduto({ ...base, preco: "1.290" }, "cadastro"))[0]).toMatchObject({
      motivo: "preco_ambiguo",
      campo: "preco",
    });
  });
});

describe("a partir de nos dois modos (US1-AC6, US4-AC2)", () => {
  it("cadastro: caixa marcada e preço vazio ⇒ a_partir_de_sem_preco no campo aPartirDe (US1-AC6)", () => {
    for (const preco of [undefined, "", "  "]) {
      const f = falhas(validarCamposProduto({ ...base, preco, aPartirDe: true }, "cadastro"));
      expect(f).toHaveLength(1);
      expect(f[0]).toMatchObject({ motivo: "a_partir_de_sem_preco", campo: "aPartirDe" });
    }
  });

  it("edicao: caixa marcada e preço vazio ⇒ ok com aPartirDe false (US4-AC2)", () => {
    const r = validarCamposProduto({ ...base, id: "5", versao: "2", preco: "", aPartirDe: true }, "edicao");
    expect(r.ok).toBe(true);
    expect(campos(r).aPartirDe).toBe(false);
    expect(campos(r).precoCentavos).toBeNull();
  });

  it("com preço, os dois modos aceitam a caixa marcada", () => {
    const cad = validarCamposProduto({ ...base, preco: "10", aPartirDe: true }, "cadastro");
    const edi = validarCamposProduto({ ...base, id: "5", versao: "2", preco: "10", aPartirDe: true }, "edicao");
    expect(campos(cad).aPartirDe).toBe(true);
    expect(campos(edi).aPartirDe).toBe(true);
  });

  it("caixa desmarcada ou ausente ⇒ false", () => {
    expect(campos(validarCamposProduto({ ...base, preco: "10", aPartirDe: false }, "cadastro")).aPartirDe).toBe(false);
    expect(campos(validarCamposProduto({ ...base, preco: "10" }, "cadastro")).aPartirDe).toBe(false);
  });
});

describe("id e versão na edição (D5)", () => {
  it("válidos como string ⇒ ok com id e versão numéricos no topo do retorno", () => {
    const r = validarCamposProduto({ ...base, id: "42", versao: "3" }, "edicao");
    expect(r).toMatchObject({ ok: true, id: 42, versao: 3 });
  });

  it("válidos como number também passam", () => {
    expect(validarCamposProduto({ ...base, id: 42, versao: 3 }, "edicao")).toMatchObject({
      ok: true,
      id: 42,
      versao: 3,
    });
  });

  it("limite 2147483647 ⇒ ok", () => {
    expect(validarCamposProduto({ ...base, id: "2147483647", versao: "1" }, "edicao")).toMatchObject({
      ok: true,
      id: 2147483647,
    });
  });

  const invalidos = [" 3", "03", "1e2", "0", "-1", "99999999999", "2147483648", "abc", "", "1.5", undefined, null];

  it.each(invalidos)("id %j ⇒ falha_geral sem campo", (id) => {
    const f = falhas(validarCamposProduto({ ...base, id, versao: "1" }, "edicao"));
    expect(f[0].motivo).toBe("falha_geral");
    expect(f[0].campo).toBeUndefined();
    expect(f[0].mensagem).toBe("Não foi possível concluir agora. Tente de novo em instantes.");
  });

  it.each(invalidos)("versao %j ⇒ falha_geral sem campo", (versao) => {
    const f = falhas(validarCamposProduto({ ...base, id: "1", versao }, "edicao"));
    expect(f[0].motivo).toBe("falha_geral");
    expect(f[0].campo).toBeUndefined();
  });

  it("cadastro ignora id e versão (não valida nem devolve)", () => {
    const r = validarCamposProduto({ ...base, id: "lixo", versao: "lixo" }, "cadastro");
    expect(r.ok).toBe(true);
  });
});

describe("várias falhas juntas, na ordem do contrato §3", () => {
  it("cadastro: nome → categoria → descrição → preço/aPartirDe", () => {
    const r = validarCamposProduto(
      { nome: "", categoriaId: "", descricao: "a".repeat(1001), preco: "", aPartirDe: true },
      "cadastro",
    );
    const f = falhas(r);
    expect(f.map((x) => x.motivo)).toEqual([
      "nome_vazio",
      "categoria_obrigatoria",
      "descricao_tamanho",
      "a_partir_de_sem_preco",
    ]);
    expect(f.map((x) => x.campo)).toEqual(["nome", "categoria", "descricao", "aPartirDe"]);
  });

  it("edicao: id/versao → nome → categoria → descrição → preço", () => {
    const f = falhas(
      validarCamposProduto(
        { id: "0", versao: "1", nome: "ab", categoriaId: "x", descricao: "a".repeat(1001), preco: "abc" },
        "edicao",
      ),
    );
    expect(f.map((x) => x.motivo)).toEqual([
      "falha_geral",
      "nome_tamanho",
      "categoria_invalida",
      "descricao_tamanho",
      "preco_invalido",
    ]);
    expect(f.map((x) => x.campo)).toEqual([undefined, "nome", "categoria", "descricao", "preco"]);
  });

  it("preço inválido vem antes de aPartirDe quando ambos falham no mesmo envio", () => {
    const f = falhas(validarCamposProduto({ ...base, preco: "abc", aPartirDe: true }, "cadastro"));
    expect(f[0]).toMatchObject({ motivo: "preco_invalido", campo: "preco" });
  });

  it("entrada que não é objeto ⇒ falhas, nunca exceção", () => {
    for (const entrada of [null, undefined, "x", 42, []]) {
      const r = validarCamposProduto(entrada, "cadastro");
      expect(r.ok).toBe(false);
    }
  });
});
