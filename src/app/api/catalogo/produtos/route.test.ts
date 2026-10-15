import { beforeEach, describe, expect, it, vi } from "vitest";

// Feature 005, T046 (SF5): contracts/publico.md §3 e §7. GET público do bloco da lista, ramo
// FALLBACK. Mock do catálogo (lerBloco, registrarFalha); sem banco, sem rede.
const lerBloco = vi.hoisted(() => vi.fn());
const registrarFalha = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogo", () => ({ lerBloco, registrarFalha }));

import * as rota from "./route";

const BLOCO = { itens: [], proximo: null, categoria: null };

function chamar(query = "") {
  return rota.GET(new Request(`http://localhost/api/catalogo/produtos${query}`));
}

beforeEach(() => {
  lerBloco.mockReset().mockResolvedValue(BLOCO);
  registrarFalha.mockReset();
});

describe("GET /api/catalogo/produtos (T046)", () => {
  it("sem query ⇒ 200 com o bloco de 'Todas' e os cabeçalhos do contrato", async () => {
    const r = await chamar();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(BLOCO);
    // Literal do contrato §3 (= NAVEGADOR_LISTA_S): se a constante mudar, este teste deve falhar.
    expect(r.headers.get("cache-control")).toBe("public, max-age=20");
    expect(r.headers.get("content-type")).toMatch(/^application\/json/);
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(lerBloco).toHaveBeenCalledWith({ categoria: null, depois: null });
  });

  it("categoria=meias ⇒ repassa o slug e devolve o bloco filtrado", async () => {
    lerBloco.mockResolvedValue({ itens: [], proximo: null, categoria: "meias" });
    const r = await chamar("?categoria=meias");
    expect(r.status).toBe(200);
    expect(((await r.json()) as { categoria: string | null }).categoria).toBe("meias");
    expect(lerBloco).toHaveBeenCalledWith({ categoria: "meias", depois: null });
  });

  it.each(["nao-existe", "MEIAS"])("categoria=%s ⇒ 'Todas' (categoria null)", async (slug) => {
    // A resolução do slug é do catálogo; a rota repassa e devolve o que ele decidiu.
    const r = await chamar(`?categoria=${slug}`);
    expect(r.status).toBe(200);
    expect(((await r.json()) as { categoria: string | null }).categoria).toBeNull();
  });

  it("repassa o cursor `depois` ao catálogo", async () => {
    await chamar("?depois=MTIzLjQ");
    expect(lerBloco).toHaveBeenCalledWith({ categoria: null, depois: "MTIzLjQ" });
  });

  it("depois inválido ⇒ 400 com corpo {} e no-store", async () => {
    lerBloco.mockResolvedValue("invalido");
    const r = await chamar("?depois=%25%25");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({});
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("banco fora ⇒ 503 {} no-store e log catalogo.banco_indisponivel sem a mensagem", async () => {
    lerBloco.mockRejectedValue(new Error("senha=segredo"));
    const r = await chamar();
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({});
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(registrarFalha).toHaveBeenCalledTimes(1);
    expect(registrarFalha).toHaveBeenCalledWith({
      evento: "catalogo.banco_indisponivel",
      rota: "/api/catalogo/produtos",
      causa: "banco",
    });
    expect(JSON.stringify(registrarFalha.mock.calls)).not.toContain("segredo");
  });

  it("só GET: POST, PUT, PATCH e DELETE não são exportados (o Next responde 405)", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect((rota as Record<string, unknown>)[m]).toBeUndefined();
    }
    expect(typeof rota.GET).toBe("function");
  });
});
