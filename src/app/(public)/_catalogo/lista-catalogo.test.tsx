// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BlocoLista, CategoriaFiltro, ProdutoCartao } from "@/lib/catalogo";
import { salvarRestauracao } from "@/lib/catalogo/restauracao";
import { violacoesGraves } from "@/test/axe";

// Feature 005, T074, ramo FALLBACK (FR-007, U1, U2, I2, US1.5, US1.9, US4.7): lista cliente.
// Os casos [ISR] (useSearchParams, "Carregando produtos…") não se aplicam: o 1º bloco vem por props.

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

import { ListaCatalogo } from "./lista-catalogo";

const categorias: CategoriaFiltro[] = [
  { slug: "meias", nome: "Meias" },
  { slug: "luvas", nome: "Luvas" },
];

function produtos(de: number, ate: number): ProdutoCartao[] {
  return Array.from({ length: ate - de + 1 }, (_, i) => {
    const n = de + i;
    const codigo = String(n).padStart(4, "0");
    return { codigo: `#${codigo}`, href: `/p/${codigo}`, nome: `Produto ${n}`, preco: "R$ 10,00", esgotado: false, capa: null };
  });
}

const bloco = (de: number, ate: number, proximo: string | null, categoria: string | null = null): BlocoLista => ({
  itens: produtos(de, ate),
  proximo,
  categoria,
});

const resposta = (corpo: BlocoLista) => new Response(JSON.stringify(corpo), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
let scrollTo: ReturnType<typeof vi.fn>;
let push: ReturnType<typeof vi.spyOn>;
let replace: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  scrollTo = vi.fn();
  vi.stubGlobal("scrollTo", scrollTo);
  window.history.replaceState(null, "", "/");
  push = vi.spyOn(window.history, "pushState");
  replace = vi.spyOn(window.history, "replaceState");
  Object.values(router).forEach((f) => f.mockClear());
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const quantos = () => screen.queryAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/p/")).length;

function semMudarUrl() {
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
}

describe("ListaCatalogo — Carregar mais (T074)", () => {
  it("acrescenta o bloco seguinte sem repetir, pede com o cursor e move o foco ao primeiro item novo", async () => {
    fetchMock.mockResolvedValueOnce(resposta(bloco(2, 4, null)));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    expect(quantos()).toBe(3);

    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(quantos()).toBe(4));

    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/produtos?depois=CUR1");
    await waitFor(() => expect(screen.getAllByRole("link", { name: /Produto 4/ })[0]).toBe(document.activeElement));
    // proximo null: o botão some
    expect(screen.queryByRole("button", { name: "Carregar mais" })).toBeNull();
    semMudarUrl();
  });

  it("com filtro, o pedido leva a categoria", async () => {
    fetchMock.mockResolvedValueOnce(resposta(bloco(4, 4, null, "meias")));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1", "meias")} />);
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(quantos()).toBe(4));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/produtos?depois=CUR1&categoria=meias");
  });

  it("falha mantém os itens, avisa com role=alert e 'Tentar de novo' repete o mesmo cursor", async () => {
    fetchMock.mockRejectedValueOnce(new Error("rede")).mockResolvedValueOnce(resposta(bloco(4, 6, null)));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);

    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível carregar mais produtos.");
    expect(quantos()).toBe(3);

    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(quantos()).toBe(6));
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      "/api/catalogo/produtos?depois=CUR1",
      "/api/catalogo/produtos?depois=CUR1",
    ]);
    expect(screen.queryByRole("alert")).toBeNull();
    semMudarUrl();
  });

  it("resposta não-200 também é falha", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(quantos()).toBe(3);
  });
});

describe("ListaCatalogo — filtro e aviso (I2, US4.7)", () => {
  it("aria-current vem do slug efetivo recebido, e o aviso anuncia o filtro", () => {
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 2, null, "meias")} />);
    const nav = screen.getByRole("navigation", { name: "Filtrar por categoria" });
    const atual = [...nav.querySelectorAll("a[aria-current]")].map((a) => a.textContent);
    expect(atual).toEqual(["Meias"]);
    const aviso = screen.getByText("Mostrando produtos de Meias");
    expect(aviso.getAttribute("aria-live")).toBe("polite");
  });

  it("sem filtro: 'Todas' atual e aviso 'Mostrando todos os produtos'", () => {
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 2, null)} />);
    const nav = screen.getByRole("navigation", { name: "Filtrar por categoria" });
    expect([...nav.querySelectorAll("a[aria-current]")].map((a) => a.textContent)).toEqual(["Todas"]);
    expect(screen.getByText("Mostrando todos os produtos")).toBeTruthy();
  });

  it("sem produtos: 'Ainda não há produtos.' e nenhum botão", () => {
    render(<ListaCatalogo categorias={[]} inicial={bloco(1, 0, null)} />);
    expect(screen.getByText("Ainda não há produtos.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("axe sem violações graves", async () => {
    const { container } = render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 4, "CUR1", "meias")} />);
    expect(await violacoesGraves(container)).toEqual([]);
  });
});

describe("ListaCatalogo — restauração (U1, U2, FR-007)", () => {
  it("clicar num item grava a restauração (itens, cursor, posição) antes de navegar", () => {
    Object.defineProperty(window, "scrollY", { value: 321, configurable: true });
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1", "meias")} />);
    const link = screen.getAllByRole("link", { name: /Produto 2/ })[0];
    link.addEventListener("click", (e) => e.preventDefault()); // jsdom não navega
    fireEvent.click(link);
    const salvo = JSON.parse(sessionStorage.getItem("catalogo:meias")!);
    expect(salvo.itens).toHaveLength(3);
    expect(salvo).toMatchObject({ cursor: "CUR1", scrollY: 321 });
    expect(typeof salvo.salvoEm).toBe("number");
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("clique com Ctrl/Meta/Shift ou botão do meio não grava (abre outra aba)", () => {
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    const link = screen.getAllByRole("link", { name: /Produto 2/ })[0];
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { metaKey: true });
    fireEvent.click(link, { shiftKey: true });
    fireEvent.click(link, { button: 1 });
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("grava o caminho do item aberto", () => {
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    const link = screen.getAllByRole("link", { name: /Produto 2/ })[0];
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(JSON.parse(sessionStorage.getItem("catalogo:todas")!).aberto).toBe("/p/0002");
  });

  it("volta pelo bfcache (pageshow persisted): a restauração guardada é descartada", async () => {
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    await act(async () => {});
    salvarRestauracao(null, { itens: produtos(1, 3), cursor: null, scrollY: 0 });
    const ev = new Event("pageshow") as Event & { persisted: boolean };
    ev.persisted = true;
    window.dispatchEvent(ev);
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull();
  });

  it("falha move o foco para 'Tentar de novo'", async () => {
    fetchMock.mockRejectedValueOnce(new Error("rede"));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 3, "CUR1")} />);
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    const botao = await screen.findByRole("button", { name: "Tentar de novo" });
    await waitFor(() => expect(document.activeElement).toBe(botao));
  });

  it("ao montar com restauração válida, recoloca os itens (72 após dois Carregar mais) e rola à posição, sem fetch", async () => {
    salvarRestauracao(null, { itens: produtos(1, 72), cursor: "CUR3", scrollY: 1800 });
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 24, "CUR1")} />);

    await waitFor(() => expect(quantos()).toBe(72));
    expect(scrollTo).toHaveBeenCalledWith(0, 1800);
    expect(fetchMock).not.toHaveBeenCalled(); // U2
    expect(sessionStorage.getItem("catalogo:todas")).toBeNull(); // usada, apagada

    // o cursor restaurado continua a partir do ponto certo
    fetchMock.mockResolvedValueOnce(resposta(bloco(73, 73, null)));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(quantos()).toBe(73));
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/produtos?depois=CUR3");
    semMudarUrl(); // U1
    expect(window.location.search).toBe("");
  });

  it("restauração de outro filtro não vale", async () => {
    salvarRestauracao("luvas", { itens: produtos(1, 72), cursor: "CUR3", scrollY: 10 });
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 24, "CUR1")} />);
    await act(async () => {});
    expect(quantos()).toBe(24);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("restauração vencida não vale", async () => {
    salvarRestauracao(null, { itens: produtos(1, 72), cursor: "CUR3", scrollY: 10 }, Date.now() - 31 * 60 * 1000);
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 24, "CUR1")} />);
    await act(async () => {});
    expect(quantos()).toBe(24);
  });

  it("a URL guarda só ?categoria: nada de blocos nela, nem pushState/replaceState/router", async () => {
    window.history.replaceState(null, "", "/?categoria=meias");
    push.mockClear();
    replace.mockClear();
    salvarRestauracao("meias", { itens: produtos(1, 48), cursor: "CUR2", scrollY: 5 });
    fetchMock.mockResolvedValueOnce(resposta(bloco(49, 50, null, "meias")));
    render(<ListaCatalogo categorias={categorias} inicial={bloco(1, 24, "CUR1", "meias")} />);
    await waitFor(() => expect(quantos()).toBe(48));
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais" }));
    await waitFor(() => expect(quantos()).toBe(50));
    expect(window.location.search).toBe("?categoria=meias");
    semMudarUrl();
  });
});
