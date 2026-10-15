// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  existeRestauracao,
  lerRestauracao,
  limparRestauracoes,
  salvarRestauracao,
  VALIDADE_RESTAURACAO_MS,
} from "./restauracao";

// Feature 005, T073 (FR-007, U2, F3): restauração da lista no sessionStorage da aba.

const item = { codigo: "#0001", href: "/p/0001", nome: "Meia", preco: "R$ 10,00", esgotado: false, capa: null };
const estado = { itens: [item], cursor: "abc", scrollY: 640 };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("restauracao (T073)", () => {
  it("grava na chave catalogo:<slug|todas> com salvoEm", () => {
    salvarRestauracao("meias", estado, 1000);
    salvarRestauracao(null, estado, 1000);
    expect(JSON.parse(sessionStorage.getItem("catalogo:meias")!)).toEqual({ ...estado, salvoEm: 1000 });
    expect(sessionStorage.getItem("catalogo:todas")).not.toBeNull();
  });

  it("lê só para o mesmo filtro", () => {
    salvarRestauracao("meias", estado);
    expect(lerRestauracao(null)).toBeNull();
    expect(lerRestauracao("luvas")).toBeNull();
    expect(lerRestauracao("meias")).toMatchObject(estado);
  });

  it("apaga depois de ler", () => {
    salvarRestauracao(null, estado);
    expect(lerRestauracao(null)).not.toBeNull();
    expect(lerRestauracao(null)).toBeNull();
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("vale com menos de 30 min; vencida não restaura (e é apagada)", () => {
    salvarRestauracao(null, estado, 0);
    expect(lerRestauracao(null, VALIDADE_RESTAURACAO_MS - 1)).not.toBeNull();
    salvarRestauracao(null, estado, 0);
    expect(lerRestauracao(null, VALIDADE_RESTAURACAO_MS)).toBeNull();
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("conteúdo corrompido ou de forma errada não restaura", () => {
    sessionStorage.setItem("catalogo:todas", "{nao-json");
    expect(lerRestauracao(null)).toBeNull();
    sessionStorage.setItem("catalogo:todas", JSON.stringify({ itens: "x", salvoEm: Date.now() }));
    expect(lerRestauracao(null)).toBeNull();
  });

  it("existeRestauracao não apaga e ignora vencidas", () => {
    expect(existeRestauracao("/p/0001")).toBe(false);
    salvarRestauracao("meias", { ...estado, aberto: "/p/0001" }, 0);
    expect(existeRestauracao("/p/0001", VALIDADE_RESTAURACAO_MS)).toBe(false);
    expect(existeRestauracao("/p/0001", 1000)).toBe(true);
    expect(existeRestauracao("/p/0002", 1000)).toBe(false); // outro detalhe não foi aberto pela lista
    salvarRestauracao("meias", estado, 0);
    expect(existeRestauracao("/p/0001", 1000)).toBe(false); // sem item clicado registrado
    expect(sessionStorage.getItem("catalogo:meias")).not.toBeNull();
  });

  it("limparRestauracoes apaga todas as chaves catalogo:* e só elas (F3)", () => {
    salvarRestauracao(null, estado);
    salvarRestauracao("meias", estado);
    sessionStorage.setItem("outra", "1");
    limparRestauracoes();
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
    expect(sessionStorage.getItem("catalogo:meias")).toBeNull();
    expect(sessionStorage.getItem("outra")).toBe("1");
  });

  it("item de forma errada (deploy mudou o cartão) descarta a restauração inteira", () => {
    sessionStorage.setItem(
      "catalogo:todas",
      JSON.stringify({ itens: [{ nome: "x" }], cursor: null, scrollY: 0, salvoEm: Date.now() }),
    );
    expect(lerRestauracao(null)).toBeNull();
  });

  it("sessionStorage que lança (modo privado): nada quebra e não restaura", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(() => salvarRestauracao(null, estado)).not.toThrow();
    expect(lerRestauracao(null)).toBeNull();
    expect(existeRestauracao("/p/0001")).toBe(false);
    expect(() => limparRestauracoes()).not.toThrow();
  });
});
