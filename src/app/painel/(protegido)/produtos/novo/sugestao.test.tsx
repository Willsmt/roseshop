// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T136 (SF14): useSugestao + AvisoSugestao (contrato interno da SF14, seção 1).
// Tipos e textos vêm de ./textos-sugestao e são reexportados por ./sugestao.
// US3-AC1 (espera), US3-AC6 (ia_indisponivel), US3-AC7 (ia_pausada), FR-027.

vi.mock("@/lib/produtos/sugestao", () => ({ sugerirProduto: vi.fn() }));

import { sugerirProduto } from "@/lib/produtos/sugestao";

import {
  AvisoSugestao,
  ESPERANDO_SUGESTAO,
  MARCADOR_SUGESTAO,
  useSugestao,
  type EstadoSugestao,
} from "./sugestao";

const sugerirMock = vi.mocked(sugerirProduto);

type Resposta = Awaited<ReturnType<typeof sugerirProduto>>;
function deferred() {
  let resolve!: (v: Resposta) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Resposta>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SUGESTAO = { nome: "Meia lisa", categoriaId: 1, descricao: "Meia de algodão" };
const ok = (sugestao = SUGESTAO): Resposta => ({ ok: true, sugestao });
const MSG_INDISPONIVEL = "Não deu para sugerir agora. Preencha você mesma.";
const MSG_PAUSADA = "As sugestões estão pausadas por agora. Preencha você mesma.";
const indisponivel = (): Resposta => ({ ok: false, motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
const pausada = (): Resposta => ({ ok: false, motivo: "ia_pausada", mensagem: MSG_PAUSADA });

beforeEach(() => {
  sugerirMock.mockReset();
});
afterEach(cleanup);

describe("constantes de texto (ia.md §6)", () => {
  it("usam reticências U+2026 e travessão U+2014", () => {
    expect(ESPERANDO_SUGESTAO).toBe("Preenchendo a partir das fotos…");
    expect(MARCADOR_SUGESTAO).toBe("Sugestão — confira");
  });
});

describe("useSugestao", () => {
  it("começa ocioso e não chama a action", () => {
    const { result } = renderHook(() => useSugestao());
    expect(result.current.estado).toEqual({ tipo: "ocioso" });
    expect(sugerirMock).not.toHaveBeenCalled();
  });

  it("US3-AC1: pedirPrimeira ⇒ esperando e chama sugerirProduto com uma cópia dos envioIds, na ordem", () => {
    sugerirMock.mockReturnValue(deferred().promise);
    const { result } = renderHook(() => useSugestao());
    const ids = ["e2", "e1", "e3"];
    act(() => result.current.pedirPrimeira(ids));
    expect(result.current.estado).toEqual({ tipo: "esperando" });
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    expect(sugerirMock).toHaveBeenCalledWith({ envioIds: ["e2", "e1", "e3"] });
    expect(sugerirMock.mock.calls[0][0].envioIds).not.toBe(ids);
  });

  it("resposta ok ⇒ pronta com a sugestão", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    const { result } = renderHook(() => useSugestao());
    act(() => result.current.pedirPrimeira(["e1"]));
    await act(async () => d.resolve(ok()));
    expect(result.current.estado).toEqual({ tipo: "pronta", sugestao: SUGESTAO });
  });

  it("pedirPrimeira só age uma vez por cadastro (esperando, pronta ou falhou)", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    const { result } = renderHook(() => useSugestao());
    act(() => result.current.pedirPrimeira(["e1"]));
    act(() => result.current.pedirPrimeira(["e1"])); // esperando
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(ok()));
    act(() => result.current.pedirPrimeira(["e9"])); // pronta
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    expect(result.current.estado.tipo).toBe("pronta");
  });

  it("pedirPrimeira também não repete depois de falha", async () => {
    sugerirMock.mockResolvedValue(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    expect(result.current.estado.tipo).toBe("falhou");
    act(() => result.current.pedirPrimeira(["e1"]));
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });

  it("US3-AC6: ia_indisponivel ⇒ falhou com a mensagem da action", async () => {
    sugerirMock.mockResolvedValue(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    expect(result.current.estado).toEqual({ tipo: "falhou", motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
  });

  it("US3-AC7: ia_pausada ⇒ falhou com a mensagem da action", async () => {
    sugerirMock.mockResolvedValue(pausada());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    expect(result.current.estado).toEqual({ tipo: "falhou", motivo: "ia_pausada", mensagem: MSG_PAUSADA });
  });

  it("action que rejeita (rede, sessão caída) ⇒ ia_indisponivel com a mensagem padrão", async () => {
    sugerirMock.mockRejectedValue(new Error("rede"));
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    expect(result.current.estado).toEqual({ tipo: "falhou", motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
  });

  it("resultado undefined (sem `ok`) ⇒ ia_indisponivel com a mensagem padrão", async () => {
    sugerirMock.mockResolvedValue(undefined as never);
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    expect(result.current.estado).toEqual({ tipo: "falhou", motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
  });

  it("US3-AC6: tentarDeNovo depois de ia_indisponivel ⇒ esperando, chama com os envioIds passados, e vira pronta", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));

    const d = deferred();
    sugerirMock.mockReturnValueOnce(d.promise);
    act(() => result.current.tentarDeNovo(["e7", "e8"]));
    expect(result.current.estado).toEqual({ tipo: "esperando" });
    expect(sugerirMock).toHaveBeenCalledTimes(2);
    expect(sugerirMock).toHaveBeenLastCalledWith({ envioIds: ["e7", "e8"] });
    await act(async () => d.resolve(ok()));
    expect(result.current.estado).toEqual({ tipo: "pronta", sugestao: SUGESTAO });
  });

  it("cada sucesso entrega um objeto de sugestão NOVO, mesmo com conteúdo igual", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    const devolvida = { ...SUGESTAO };
    sugerirMock.mockResolvedValueOnce(ok(devolvida));
    await act(async () => result.current.tentarDeNovo(["e1"]));
    const entregue = (result.current.estado as Extract<EstadoSugestao, { tipo: "pronta" }>).sugestao;
    expect(entregue).toEqual(SUGESTAO);
    expect(entregue).not.toBe(devolvida); // identidade nova, não o objeto da action
  });

  it("tentarDeNovo falha de novo ⇒ volta a falhou", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));
    sugerirMock.mockRejectedValueOnce(new Error("rede"));
    await act(async () => result.current.tentarDeNovo(["e1"]));
    expect(result.current.estado).toMatchObject({ tipo: "falhou", motivo: "ia_indisponivel" });
  });

  it("tentarDeNovo não age em ocioso, esperando, pronta nem ia_pausada", async () => {
    const { result } = renderHook(() => useSugestao());
    act(() => result.current.tentarDeNovo(["e1"])); // ocioso
    expect(sugerirMock).not.toHaveBeenCalled();

    const d = deferred();
    sugerirMock.mockReturnValueOnce(d.promise);
    act(() => result.current.pedirPrimeira(["e1"]));
    act(() => result.current.tentarDeNovo(["e1"])); // esperando
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(ok()));
    act(() => result.current.tentarDeNovo(["e1"])); // pronta
    expect(sugerirMock).toHaveBeenCalledTimes(1);

    const outro = renderHook(() => useSugestao());
    sugerirMock.mockResolvedValueOnce(pausada());
    await act(async () => outro.result.current.pedirPrimeira(["e1"]));
    act(() => outro.result.current.tentarDeNovo(["e1"])); // ia_pausada
    expect(sugerirMock).toHaveBeenCalledTimes(2);
    expect(outro.result.current.estado.tipo).toBe("falhou");
  });

  it("duplo toque não dispara dois pedidos", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    const { result } = renderHook(() => useSugestao());
    await act(async () => result.current.pedirPrimeira(["e1"]));

    const pedidos: ReturnType<typeof deferred>[] = [];
    sugerirMock.mockImplementation(() => {
      const d = deferred();
      pedidos.push(d);
      return d.promise;
    });
    act(() => {
      result.current.tentarDeNovo(["e1"]);
      result.current.tentarDeNovo(["e1"]);
    });
    expect(pedidos).toHaveLength(1);
    await act(async () => pedidos[0].resolve(ok()));
    expect(result.current.estado).toEqual({ tipo: "pronta", sugestao: SUGESTAO });
  });
});

describe("AvisoSugestao", () => {
  const renderAviso = (estado: EstadoSugestao, onTentarDeNovo = vi.fn()) => {
    render(<AvisoSugestao estado={estado} onTentarDeNovo={onTentarDeNovo} />);
    return onTentarDeNovo;
  };

  it.each<[string, EstadoSugestao]>([
    ["ocioso", { tipo: "ocioso" }],
    ["esperando", { tipo: "esperando" }],
    ["pronta", { tipo: "pronta", sugestao: SUGESTAO }],
    ["falhou ia_indisponivel", { tipo: "falhou", motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL }],
    ["falhou ia_pausada", { tipo: "falhou", motivo: "ia_pausada", mensagem: MSG_PAUSADA }],
  ])("%s: o contêiner role=status (região viva) está sempre presente", (_n, estado) => {
    renderAviso(estado);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("ocioso e pronta: contêiner vazio, sem botão", () => {
    renderAviso({ tipo: "ocioso" });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    cleanup();
    renderAviso({ tipo: "pronta", sugestao: SUGESTAO });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US3-AC1: esperando ⇒ \"Preenchendo a partir das fotos…\" dentro do status, sem botão", () => {
    renderAviso({ tipo: "esperando" });
    expect(screen.getByRole("status")).toHaveTextContent("Preenchendo a partir das fotos…");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("US3-AC6: ia_indisponivel ⇒ mensagem + botão \"Tentar sugestão de novo\" (type=button) que chama onTentarDeNovo", () => {
    const onTentar = renderAviso({ tipo: "falhou", motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
    expect(screen.getByRole("status")).toHaveTextContent(MSG_INDISPONIVEL);
    const botao = screen.getByRole("button", { name: "Tentar sugestão de novo" });
    expect(botao).toHaveAttribute("type", "button");
    fireEvent.click(botao);
    expect(onTentar).toHaveBeenCalledTimes(1);
  });

  it("US3-AC7: ia_pausada ⇒ mensagem e NENHUM botão de repetir", () => {
    renderAviso({ tipo: "falhou", motivo: "ia_pausada", mensagem: MSG_PAUSADA });
    expect(screen.getByRole("status")).toHaveTextContent(MSG_PAUSADA);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("texto em 16 px ou mais (text-base)", () => {
    renderAviso({ tipo: "esperando" });
    const texto = screen.getByText("Preenchendo a partir das fotos…");
    expect(texto.closest(".text-base")).not.toBeNull();
  });
});
