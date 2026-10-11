// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T088 (SF9): hook do envio das fotos no cadastro (contrato interno da SF9, "usar-envio.ts").
// REVISÃO 2: D1 (pendentes), D3 (sem blob URL do original), correções 2, 3, 5, 6 e 7.
// Actions e pipeline do aparelho mockados; fetch e blob URLs stubados. Sem rede.

vi.mock("@/lib/fotos/actions", () => ({ pedirEnvio: vi.fn(), confirmarEnvio: vi.fn() }));
vi.mock("@/lib/fotos/aparelho/preparar-foto", () => ({ prepararFoto: vi.fn(), abrirImagem: vi.fn() }));

import { confirmarEnvio, pedirEnvio } from "@/lib/fotos/actions";
import { abrirImagem, prepararFoto } from "@/lib/fotos/aparelho/preparar-foto";
import { mensagemFoto } from "@/lib/fotos/mensagens";

import { TEMPO_LIMITE_ENVIO_MS, conferirArquivo, useEnvioFotos } from "./usar-envio";

const prepararMock = vi.mocked(prepararFoto);
const abrirMock = vi.mocked(abrirImagem);
const pedirMock = vi.mocked(pedirEnvio);
const confirmarMock = vi.mocked(confirmarEnvio);
const fetchMock = vi.fn();

// Blob URLs: cada criação devolve uma URL nova e guarda o objeto de origem.
let criadas: Map<string, Blob>;
let revogadas: string[];
const criarUrl = vi.fn((o: Blob) => {
  const url = `blob:teste/${criadas.size + 1}`;
  criadas.set(url, o);
  return url;
});
const revogarUrl = vi.fn((url: string) => {
  revogadas.push(url);
});
const urlDe = (o: Blob) => [...criadas].find(([, b]) => b === o)?.[0];

const AREA = { x: 10, y: 20, lado: 800 };
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];

let seq = 0;
function arquivo(nome = `foto${++seq}.jpg`): File {
  return new File([new Uint8Array([...JPEG, ...new Array(54).fill(0)])], nome, { type: "image/jpeg" });
}
function tratado(tamanho = 500): Blob {
  return new Blob([new Uint8Array(tamanho)], { type: "image/webp" });
}

const HEADERS = { "content-type": "image/webp", "if-none-match": "*" } as const;
function pedidoOk(envioId: string) {
  return { ok: true as const, envioId, url: `https://r2.exemplo/${envioId}`, headers: { ...HEADERS } };
}
const respostaOk = () => ({ ok: true, status: 200 }) as Response;
function falhaDe(motivo: Parameters<typeof mensagemFoto>[0]) {
  return { ok: false as const, motivo, mensagem: mensagemFoto(motivo) };
}

type Adiado<T> = { promessa: Promise<T>; resolver: (v: T) => void; rejeitar: (e: unknown) => void };
function adiado<T>(): Adiado<T> {
  let resolver!: (v: T) => void;
  let rejeitar!: (e: unknown) => void;
  const promessa = new Promise<T>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });
  return { promessa, resolver, rejeitar };
}

// Fluxo feliz padrão: cada envio recebe um envioId novo (e1, e2, ...).
function fluxoFeliz() {
  let n = 0;
  prepararMock.mockImplementation(async () => ({ blob: tratado(), formato: "webp" as const }));
  pedirMock.mockImplementation(async () => pedidoOk(`e${++n}`));
  fetchMock.mockResolvedValue(respostaOk());
  confirmarMock.mockImplementation(async ({ envioId }) => ({ ok: true as const, envioId, arquivo: `${envioId}.webp` }));
}

async function enviarEsperar(
  result: { current: ReturnType<typeof useEnvioFotos> },
  a: File,
  total: number,
) {
  act(() => result.current.enviar(a, AREA));
  await waitFor(() => {
    expect(result.current.fotos).toHaveLength(total);
    expect(result.current.emCurso).toBe(false);
  });
}

beforeEach(() => {
  criadas = new Map();
  revogadas = [];
  criarUrl.mockClear();
  revogarUrl.mockClear();
  Object.defineProperty(URL, "createObjectURL", { value: criarUrl, configurable: true, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revogarUrl, configurable: true, writable: true });
  vi.stubGlobal("fetch", fetchMock);
  for (const m of [prepararMock, abrirMock, pedirMock, confirmarMock, fetchMock]) m.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEnvioFotos — fluxo feliz (US1-AC3)", () => {
  it("prepararFoto → pedirEnvio → PUT com exatamente os headers devolvidos → confirmarEnvio ⇒ enviada", async () => {
    const a = arquivo();
    const blob = tratado(777);
    prepararMock.mockResolvedValue({ blob, formato: "webp" });
    const pedido = adiado<Awaited<ReturnType<typeof pedirEnvio>>>();
    pedirMock.mockReturnValue(pedido.promessa);
    fetchMock.mockResolvedValue(respostaOk());
    confirmarMock.mockResolvedValue({ ok: true, envioId: "e1", arquivo: "e1.webp" });

    const { result } = renderHook(() => useEnvioFotos());
    expect(result.current.fotos).toEqual([]);
    expect(result.current.envioIds).toEqual([]);
    expect(result.current.emCurso).toBe(false);

    act(() => result.current.enviar(a, AREA));
    // Durante o envio: a foto aparece como "enviando" e emCurso fica true.
    expect(result.current.fotos).toHaveLength(1);
    expect(result.current.fotos[0].estado).toEqual({ tipo: "enviando" });
    expect(result.current.emCurso).toBe(true);
    await waitFor(() => expect(pedirMock).toHaveBeenCalledTimes(1));
    expect(result.current.emCurso).toBe(true);
    expect(result.current.envioIds).toEqual([]);

    const devolvido = pedidoOk("e1");
    await act(async () => pedido.resolver(devolvido));
    await waitFor(() => expect(result.current.emCurso).toBe(false));

    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(prepararMock.mock.calls[0][0]).toBe(a);
    expect(prepararMock.mock.calls[0][1]).toEqual(AREA);
    expect(pedirMock).toHaveBeenCalledWith({ formato: "webp", tamanho: 777 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://r2.exemplo/e1");
    expect(init.method).toBe("PUT");
    expect(init.headers).toStrictEqual({ "content-type": "image/webp", "if-none-match": "*" });
    expect(init.body).toBe(blob);
    // Correção 2: o PUT recebe o signal do AbortController da tentativa.
    expect(init.signal).toBeDefined();
    expect(init.signal.aborted).toBe(false);
    expect(confirmarMock).toHaveBeenCalledWith({ envioId: "e1" });

    expect(result.current.fotos[0].estado).toEqual({ tipo: "enviada", envioId: "e1" });
    expect(result.current.envioIds).toEqual(["e1"]);
    // A miniatura é o blob tratado; D3: nenhuma blob URL do arquivo original.
    expect(result.current.fotos[0].previa).toBe(urlDe(blob));
    expect(urlDe(a)).toBeUndefined();
    expect(result.current.aviso).toBeNull();
  });

  it("ordem das chamadas: prepararFoto, pedirEnvio, fetch, confirmarEnvio", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    const ordem = [prepararMock, pedirMock, fetchMock, confirmarMock].map((m) => m.mock.invocationCallOrder[0]);
    expect([...ordem].sort((x, y) => x - y)).toEqual(ordem);
  });

  it("envioIds segue a ordem de fotos e só conta as enviadas", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    expect(result.current.envioIds).toEqual(["e1", "e2"]);
    fetchMock.mockRejectedValueOnce(new TypeError("rede"));
    await enviarEsperar(result, arquivo(), 3);
    expect(result.current.envioIds).toEqual(["e1", "e2"]);
  });
});

describe("useEnvioFotos — falha de conexão no PUT (US2-AC8)", () => {
  it.each([
    ["fetch rejeita", () => fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"))],
    ["resposta !ok", () => fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as Response)],
  ])("%s ⇒ Não enviada com Tentar de novo; confirmarEnvio não é chamado; enviadas preservadas", async (_n, falhar) => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    confirmarMock.mockClear();

    falhar();
    await enviarEsperar(result, arquivo(), 2);
    expect(result.current.fotos[1].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("nao_enviada"),
      podeTentar: true,
    });
    expect(mensagemFoto("nao_enviada")).toBe("Não enviada");
    expect(confirmarMock).not.toHaveBeenCalled();
    // A foto já enviada continua lá.
    expect(result.current.fotos[0].estado).toEqual({ tipo: "enviada", envioId: "e1" });
    expect(result.current.envioIds).toEqual(["e1"]);
    expect(result.current.emCurso).toBe(false);
  });
});

describe("useEnvioFotos — recusa no aparelho (US2-AC3, US2-AC7)", () => {
  it.each(["formato", "nao_abre", "pequena", "grande"] as const)(
    "%s ⇒ a foto sai da lista, aviso com a mensagem de F§8, nada é pedido nem enviado",
    async (motivo) => {
      const a = arquivo();
      prepararMock.mockResolvedValue({ motivo });
      const { result } = renderHook(() => useEnvioFotos());
      act(() => result.current.enviar(a, AREA));
      await waitFor(() => expect(result.current.aviso).toBe(mensagemFoto(motivo)));
      expect(result.current.fotos).toEqual([]);
      expect(result.current.emCurso).toBe(false);
      expect(pedirMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(confirmarMock).not.toHaveBeenCalled();
      // D3: sem blob tratado não há blob URL nenhuma (nem do original).
      expect(urlDe(a)).toBeUndefined();
      expect(criadas.size).toBe(0);
    },
  );

  it("nao_enviada do prepararFoto ⇒ Não enviada com Tentar de novo, nada é pedido", async () => {
    prepararMock.mockResolvedValue({ motivo: "nao_enviada" });
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("nao_enviada"),
      podeTentar: true,
    });
    expect(result.current.aviso).toBeNull();
    expect(pedirMock).not.toHaveBeenCalled();
  });

  it("enviar limpa o aviso anterior", async () => {
    prepararMock.mockResolvedValueOnce({ motivo: "pequena" });
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    await waitFor(() => expect(result.current.aviso).toBe(mensagemFoto("pequena")));
    fluxoFeliz();
    act(() => result.current.enviar(arquivo(), AREA));
    expect(result.current.aviso).toBeNull();
    await waitFor(() => expect(result.current.envioIds).toEqual(["e1"]));
  });

  it("mostrarAviso(motivo) e limparAviso", () => {
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.mostrarAviso("formato"));
    expect(result.current.aviso).toBe(mensagemFoto("formato"));
    act(() => result.current.limparAviso());
    expect(result.current.aviso).toBeNull();
  });
});

describe("useEnvioFotos — recusa nao_passou na confirmação (US2-AC10)", () => {
  const NAO_PASSOU_1 = "Não deu para usar essa foto. Tente de novo ou use 'Tirar foto'.";
  const NAO_PASSOU_2 = "Essa foto não está passando. Escolha outra ou peça ajuda.";

  it("1ª recusa ⇒ mensagem da 1ª; 2ª seguida na mesma tela ⇒ mensagem da repetida", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValue(falhaDe("nao_passou"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });
    expect(NAO_PASSOU_1).toBe(mensagemFoto("nao_passou"));
    await enviarEsperar(result, arquivo(), 2);
    expect(result.current.fotos[1].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_2, podeTentar: true });
    expect(NAO_PASSOU_2).toBe(mensagemFoto("nao_passou", { repetida: true }));
  });

  it("um sucesso no meio zera a sequência", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValueOnce(falhaDe("nao_passou"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2); // sucesso
    expect(result.current.fotos[1].estado.tipo).toBe("enviada");
    confirmarMock.mockResolvedValueOnce(falhaDe("nao_passou"));
    await enviarEsperar(result, arquivo(), 3);
    expect(result.current.fotos[2].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });
  });

  it("US2-AC10 na MESMA foto: nao_passou → tentarDeNovo → nao_passou ⇒ mensagem da repetida", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValue(falhaDe("nao_passou"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });
    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    await waitFor(() => expect(confirmarMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.emCurso).toBe(false));
    expect(result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_2, podeTentar: true });
  });

  it("US2-AC10 na MESMA foto: nao_passou → falha de rede → nao_passou ⇒ mensagem NÃO repetida", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValue(falhaDe("nao_passou"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    const chave = result.current.fotos[0].chave;
    expect(result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });

    fetchMock.mockRejectedValueOnce(new TypeError("rede"));
    act(() => result.current.tentarDeNovo(chave));
    await waitFor(() =>
      expect(result.current.fotos[0].estado).toEqual({
        tipo: "nao_enviada",
        mensagem: mensagemFoto("nao_enviada"),
        podeTentar: true,
      }),
    );

    act(() => result.current.tentarDeNovo(chave));
    await waitFor(() => expect(confirmarMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.emCurso).toBe(false));
    expect(result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });
  });

  it("a sequência é da tela: outro hook (outra tela) começa da 1ª mensagem", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValue(falhaDe("nao_passou"));
    const primeira = renderHook(() => useEnvioFotos());
    await enviarEsperar(primeira.result, arquivo(), 1);
    primeira.unmount();
    const segunda = renderHook(() => useEnvioFotos());
    await enviarEsperar(segunda.result, arquivo(), 1);
    expect(segunda.result.current.fotos[0].estado).toEqual({ tipo: "nao_enviada", mensagem: NAO_PASSOU_1, podeTentar: true });
  });
});

describe("useEnvioFotos — falhas das actions", () => {
  it("muitos_pendentes ⇒ Não enviada sem Tentar de novo e a mensagem no lugar da miniatura (previa null)", async () => {
    fluxoFeliz();
    pedirMock.mockResolvedValue(falhaDe("muitos_pendentes"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("muitos_pendentes"),
      podeTentar: false,
    });
    expect(result.current.fotos[0].previa).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("correção 7: muitos_pendentes solta o blob tratado (URL revogada) e tentarDeNovo nada faz", async () => {
    fluxoFeliz();
    const blob = tratado(123);
    prepararMock.mockResolvedValue({ blob, formato: "webp" });
    pedirMock.mockResolvedValue(falhaDe("muitos_pendentes"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    for (const url of criadas.keys()) expect(revogadas).toContain(url);
    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(pedirMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("muitos_pendentes"),
      podeTentar: false,
    });
  });

  it("correção 6: prepararFoto que REJEITA ⇒ Não enviada com Tentar de novo, nada é pedido", async () => {
    prepararMock.mockRejectedValue(new Error("canvas quebrou"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("nao_enviada"),
      podeTentar: true,
    });
    expect(pedirMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falha_geral do pedirEnvio ⇒ Não enviada com a mensagem da falha e Tentar de novo", async () => {
    fluxoFeliz();
    pedirMock.mockResolvedValue(falhaDe("falha_geral"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("falha_geral"),
      podeTentar: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pedirEnvio rejeita (sessão expirada) ⇒ mensagem falha_geral e Tentar de novo", async () => {
    fluxoFeliz();
    pedirMock.mockRejectedValue(new Error("UnauthorizedError"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("falha_geral"),
      podeTentar: true,
    });
  });

  it("confirmarEnvio rejeita ⇒ mensagem falha_geral e Tentar de novo", async () => {
    fluxoFeliz();
    confirmarMock.mockRejectedValue(new Error("UnauthorizedError"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("falha_geral"),
      podeTentar: true,
    });
    expect(result.current.envioIds).toEqual([]);
  });

  it("confirmarEnvio com outra falha (grande) ⇒ mensagem da falha e Tentar de novo", async () => {
    fluxoFeliz();
    confirmarMock.mockResolvedValue(falhaDe("grande"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("grande"),
      podeTentar: true,
    });
  });
});

describe("useEnvioFotos — tentarDeNovo", () => {
  it("falha antes da confirmação ⇒ refaz desde prepararFoto com o MESMO arquivo e a MESMA área (nota 2)", async () => {
    fluxoFeliz();
    fetchMock.mockRejectedValueOnce(new TypeError("rede"));
    const a = arquivo();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, a, 1);
    expect(result.current.fotos[0].estado.tipo).toBe("nao_enviada");
    const chave = result.current.fotos[0].chave;

    act(() => result.current.tentarDeNovo(chave));
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    expect(prepararMock).toHaveBeenCalledTimes(2);
    expect(prepararMock.mock.calls[1][0]).toBe(a);
    expect(prepararMock.mock.calls[1][1]).toEqual(AREA);
    expect(result.current.fotos).toHaveLength(1);
    expect(result.current.fotos[0].chave).toBe(chave);
    expect(result.current.envioIds).toEqual(["e2"]);
  });

  it("depois de falha_geral no pedirEnvio também refaz desde prepararFoto", async () => {
    fluxoFeliz();
    pedirMock.mockResolvedValueOnce(falhaDe("falha_geral"));
    const a = arquivo();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, a, 1);
    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    expect(prepararMock).toHaveBeenCalledTimes(2);
    expect(prepararMock.mock.calls[1][0]).toBe(a);
  });

  it("muitos_pendentes (podeTentar false) ⇒ tentarDeNovo não faz nada", async () => {
    fluxoFeliz();
    pedirMock.mockResolvedValue(falhaDe("muitos_pendentes"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(pedirMock).toHaveBeenCalledTimes(1);
    expect(result.current.emCurso).toBe(false);
  });

  it("duplo tentarDeNovo ⇒ um só fluxo (um prepararFoto, um pedirEnvio, um PUT)", async () => {
    fluxoFeliz();
    fetchMock.mockRejectedValueOnce(new TypeError("rede"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    const chave = result.current.fotos[0].chave;
    prepararMock.mockClear();
    pedirMock.mockClear();
    fetchMock.mockClear();
    act(() => {
      result.current.tentarDeNovo(chave);
      result.current.tentarDeNovo(chave);
    });
    act(() => result.current.tentarDeNovo(chave));
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(pedirMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.envioIds).toHaveLength(1);
  });

  it("foto enviada ⇒ tentarDeNovo não faz nada", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(result.current.envioIds).toEqual(["e1"]);
  });
});

describe("useEnvioFotos — foto expirada (edge case de expiração)", () => {
  it("marcarExpiradas ⇒ Não enviada com a mensagem foto_expirada, aviso, previa mantida", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    const previa = result.current.fotos[0].previa;

    act(() => result.current.marcarExpiradas(["e1"]));
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("foto_expirada"),
      podeTentar: true,
    });
    expect(result.current.fotos[0].previa).toBe(previa);
    expect(result.current.fotos[1].estado).toEqual({ tipo: "enviada", envioId: "e2" });
    expect(result.current.envioIds).toEqual(["e2"]);
    expect(result.current.aviso).toBe(mensagemFoto("foto_expirada"));
  });

  it("tentarDeNovo de expirada NÃO chama prepararFoto e reenvia o mesmo blob tratado com envioId novo", async () => {
    fluxoFeliz();
    const blob = tratado(321);
    prepararMock.mockResolvedValue({ blob, formato: "jpeg" });
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    act(() => result.current.marcarExpiradas(["e1"]));
    pedirMock.mockClear();
    fetchMock.mockClear();
    confirmarMock.mockClear();

    act(() => result.current.tentarDeNovo(result.current.fotos[0].chave));
    await waitFor(() => expect(result.current.fotos[0].estado).toEqual({ tipo: "enviada", envioId: "e2" }));
    expect(prepararMock).toHaveBeenCalledTimes(1);
    expect(pedirMock).toHaveBeenCalledWith({ formato: "jpeg", tamanho: 321 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("https://r2.exemplo/e2");
    expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    expect(fetchMock.mock.calls[0][1].body).toBe(blob);
    expect(confirmarMock).toHaveBeenCalledWith({ envioId: "e2" });
    expect(result.current.envioIds).toEqual(["e2"]);
  });
});

describe("useEnvioFotos — aviso de expirada some quando não resta expirada (correção 5)", () => {
  it("continua enquanto restar alguma expirada; some quando a última é reenviada com sucesso", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    act(() => result.current.marcarExpiradas(["e1", "e2"]));
    expect(result.current.aviso).toBe(mensagemFoto("foto_expirada"));
    const [primeira, segunda] = result.current.fotos;

    act(() => result.current.tentarDeNovo(primeira.chave));
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    // A 2ª ainda está expirada: o aviso continua.
    expect(result.current.fotos[1].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("foto_expirada"),
      podeTentar: true,
    });
    expect(result.current.aviso).toBe(mensagemFoto("foto_expirada"));

    act(() => result.current.tentarDeNovo(segunda.chave));
    await waitFor(() => expect(result.current.fotos[1].estado.tipo).toBe("enviada"));
    expect(result.current.aviso).toBeNull();
  });

  it("some quando a última expirada é removida", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    act(() => result.current.marcarExpiradas(["e2"]));
    expect(result.current.aviso).toBe(mensagemFoto("foto_expirada"));
    act(() => result.current.remover(result.current.fotos[1].chave));
    expect(result.current.fotos).toHaveLength(1);
    expect(result.current.aviso).toBeNull();
  });

  it("remover outra foto (não expirada) não tira o aviso", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    act(() => result.current.marcarExpiradas(["e2"]));
    act(() => result.current.remover(result.current.fotos[0].chave));
    expect(result.current.aviso).toBe(mensagemFoto("foto_expirada"));
  });
});

describe("useEnvioFotos — remover e mover (US1-AC5, US1-AC6)", () => {
  it("remover sai sem confirmação, as demais sobem e a blob URL é revogada", async () => {
    fluxoFeliz();
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    await enviarEsperar(result, arquivo(), 3);
    const [primeira, segunda, terceira] = result.current.fotos;

    act(() => result.current.remover(primeira.chave));
    expect(confirmar).not.toHaveBeenCalled();
    expect(result.current.fotos.map((f) => f.chave)).toEqual([segunda.chave, terceira.chave]);
    expect(result.current.envioIds).toEqual(["e2", "e3"]);
    expect(revogadas).toContain(primeira.previa);
    confirmar.mockRestore();
  });

  it("remover durante o envio: o resultado tardio é ignorado", async () => {
    fluxoFeliz();
    const confirmacao = adiado<Awaited<ReturnType<typeof confirmarEnvio>>>();
    confirmarMock.mockReturnValueOnce(confirmacao.promessa);
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    await waitFor(() => expect(confirmarMock).toHaveBeenCalledTimes(1));
    act(() => result.current.remover(result.current.fotos[0].chave));
    expect(result.current.fotos).toEqual([]);
    expect(result.current.emCurso).toBe(false);

    await act(async () => {
      confirmacao.resolver({ ok: true, envioId: "e1", arquivo: "e1.webp" });
      await confirmacao.promessa;
    });
    expect(result.current.fotos).toEqual([]);
    expect(result.current.envioIds).toEqual([]);
  });

  it("mover(de, para) tira da posição de e insere em para", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    await enviarEsperar(result, arquivo(), 2);
    await enviarEsperar(result, arquivo(), 3);
    act(() => result.current.mover(2, 0));
    expect(result.current.envioIds).toEqual(["e3", "e1", "e2"]);
    act(() => result.current.mover(0, 1));
    expect(result.current.envioIds).toEqual(["e1", "e3", "e2"]);
    act(() => result.current.mover(1, 2));
    expect(result.current.envioIds).toEqual(["e1", "e2", "e3"]);
  });
});

describe("useEnvioFotos — memória", () => {
  it("desmontar revoga todas as blob URLs criadas e ignora resultados pendentes", async () => {
    fluxoFeliz();
    const { result, unmount } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    const preparo = adiado<Awaited<ReturnType<typeof prepararFoto>>>();
    prepararMock.mockReturnValueOnce(preparo.promessa);
    act(() => result.current.enviar(arquivo(), AREA));
    await waitFor(() => expect(prepararMock).toHaveBeenCalledTimes(2));

    unmount();
    expect(criadas.size).toBeGreaterThan(0);
    for (const url of criadas.keys()) expect(revogadas).toContain(url);

    // O tratamento termina depois de sair da tela: nenhuma blob URL nova fica sem revogar.
    await act(async () => {
      preparo.resolver({ blob: tratado(), formato: "webp" });
      await preparo.promessa;
    });
    await new Promise((r) => setTimeout(r, 0));
    for (const url of criadas.keys()) expect(revogadas).toContain(url);
  });
});

describe("conferirArquivo (US2-AC3, US2-AC7)", () => {
  it("GIF ⇒ 'formato' sem tentar abrir a imagem", async () => {
    const gif = new File([new TextEncoder().encode("GIF89a"), new Uint8Array(58)], "a.gif", { type: "image/gif" });
    await expect(conferirArquivo(gif)).resolves.toBe("formato");
    expect(abrirMock).not.toHaveBeenCalled();
  });

  it("nome e MIME não contam: GIF chamado de .jpg ⇒ 'formato'", async () => {
    const gif = new File([new TextEncoder().encode("GIF89a"), new Uint8Array(58)], "a.jpg", { type: "image/jpeg" });
    await expect(conferirArquivo(gif)).resolves.toBe("formato");
    expect(abrirMock).not.toHaveBeenCalled();
  });

  it("JPEG que o aparelho não abre ⇒ 'nao_abre'", async () => {
    abrirMock.mockResolvedValue({ motivo: "nao_abre" });
    const a = arquivo();
    await expect(conferirArquivo(a)).resolves.toBe("nao_abre");
    expect(abrirMock).toHaveBeenCalledTimes(1);
    expect(abrirMock.mock.calls[0][0]).toBe(a);
  });

  it("imagem que abre ⇒ null e a imagem é fechada", async () => {
    const close = vi.fn();
    abrirMock.mockResolvedValue({ width: 1000, height: 800, close });
    await expect(conferirArquivo(arquivo())).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("correção 3: leitura do arquivo que rejeita ⇒ 'nao_abre' (nunca rejeita)", async () => {
    const quebrado = {
      size: 64,
      type: "image/jpeg",
      slice: () => ({ arrayBuffer: () => Promise.reject(new Error("NotReadableError")) }),
      arrayBuffer: () => Promise.reject(new Error("NotReadableError")),
    } as unknown as Blob;
    await expect(conferirArquivo(quebrado)).resolves.toBe("nao_abre");
    expect(abrirMock).not.toHaveBeenCalled();
  });

  it("correção 3: abrirImagem que rejeita ⇒ 'nao_abre' (nunca rejeita)", async () => {
    abrirMock.mockRejectedValue(new Error("decode"));
    await expect(conferirArquivo(arquivo())).resolves.toBe("nao_abre");
  });

  it("correção 3: imagem aberta 300×500 ⇒ 'pequena' e a imagem é fechada", async () => {
    const close = vi.fn();
    abrirMock.mockResolvedValue({ width: 300, height: 500, close });
    await expect(conferirArquivo(arquivo())).resolves.toBe("pequena");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("correção 3: imagem aberta 1000×399 ⇒ 'pequena'", async () => {
    abrirMock.mockResolvedValue({ width: 1000, height: 399, close: vi.fn() });
    await expect(conferirArquivo(arquivo())).resolves.toBe("pequena");
  });

  it("correção 3: imagem aberta 400×400 ⇒ null", async () => {
    const close = vi.fn();
    abrirMock.mockResolvedValue({ width: 400, height: 400, close });
    await expect(conferirArquivo(arquivo())).resolves.toBeNull();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("useEnvioFotos — previa sem o original (D3)", () => {
  it("previa null durante a preparação; depois, blob URL do tratado; nunca blob URL do original", async () => {
    const a = arquivo();
    const blob = tratado(222);
    const preparo = adiado<Awaited<ReturnType<typeof prepararFoto>>>();
    prepararMock.mockReturnValue(preparo.promessa);
    pedirMock.mockResolvedValue(pedidoOk("e1"));
    fetchMock.mockResolvedValue(respostaOk());
    confirmarMock.mockResolvedValue({ ok: true, envioId: "e1", arquivo: "e1.webp" });

    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(a, AREA));
    await waitFor(() => expect(prepararMock).toHaveBeenCalledTimes(1));
    expect(result.current.fotos[0].estado).toEqual({ tipo: "enviando" });
    expect(result.current.fotos[0].previa).toBeNull();
    expect(criarUrl).not.toHaveBeenCalled();

    await act(async () => {
      preparo.resolver({ blob, formato: "webp" });
      await preparo.promessa;
    });
    await waitFor(() => expect(result.current.fotos[0].previa).toBe(urlDe(blob)));
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    expect(criarUrl.mock.calls.every(([o]) => o !== a)).toBe(true);
    expect(urlDe(a)).toBeUndefined();
  });
});

describe("useEnvioFotos — pendentes (D1)", () => {
  it("sem fotos ⇒ pendentes false", () => {
    const { result } = renderHook(() => useEnvioFotos());
    expect(result.current.pendentes).toBe(false);
  });

  it("com foto enviando ⇒ pendentes true; só enviadas ⇒ false", async () => {
    fluxoFeliz();
    const confirmacao = adiado<Awaited<ReturnType<typeof confirmarEnvio>>>();
    confirmarMock.mockReturnValueOnce(confirmacao.promessa);
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    expect(result.current.pendentes).toBe(true);
    await waitFor(() => expect(confirmarMock).toHaveBeenCalledTimes(1));
    expect(result.current.pendentes).toBe(true);
    await act(async () => {
      confirmacao.resolver({ ok: true, envioId: "e1", arquivo: "e1.webp" });
      await confirmacao.promessa;
    });
    await waitFor(() => expect(result.current.fotos[0].estado.tipo).toBe("enviada"));
    expect(result.current.pendentes).toBe(false);
  });

  it("com alguma foto nao_enviada ⇒ pendentes true mesmo com outra enviada e nada em curso", async () => {
    fluxoFeliz();
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    fetchMock.mockRejectedValueOnce(new TypeError("rede"));
    await enviarEsperar(result, arquivo(), 2);
    expect(result.current.fotos[1].estado.tipo).toBe("nao_enviada");
    expect(result.current.emCurso).toBe(false);
    expect(result.current.envioIds).toEqual(["e1"]);
    expect(result.current.pendentes).toBe(true);
    // Remover a não enviada ⇒ nada pendente.
    act(() => result.current.remover(result.current.fotos[1].chave));
    expect(result.current.pendentes).toBe(false);
  });

  it("muitos_pendentes (sem Tentar de novo) também conta como pendente", async () => {
    fluxoFeliz();
    pedirMock.mockResolvedValue(falhaDe("muitos_pendentes"));
    const { result } = renderHook(() => useEnvioFotos());
    await enviarEsperar(result, arquivo(), 1);
    expect(result.current.pendentes).toBe(true);
  });
});

// fetch que só termina se o signal for abortado (como o fetch real: rejeita com AbortError).
function fetchPendurado() {
  const sinais: AbortSignal[] = [];
  fetchMock.mockImplementation((_url: string, init: RequestInit) => {
    const sinal = init?.signal ?? undefined;
    if (sinal) sinais.push(sinal);
    return new Promise((_res, rej) => {
      sinal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
    });
  });
  return sinais;
}

describe("useEnvioFotos — tempo-limite e cancelamento do PUT (correção 2)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("TEMPO_LIMITE_ENVIO_MS é exportado e vale 60 s", () => {
    expect(TEMPO_LIMITE_ENVIO_MS).toBe(60_000);
  });

  it("PUT que não termina: passado o tempo-limite ⇒ abortado e Não enviada com Tentar de novo", async () => {
    vi.useFakeTimers();
    prepararMock.mockResolvedValue({ blob: tratado(), formato: "webp" });
    pedirMock.mockResolvedValue(pedidoOk("e1"));
    const sinais = fetchPendurado();
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    // Deixa prepararFoto e pedirEnvio terminarem (microtarefas) até o PUT começar.
    for (let i = 0; i < 20 && fetchMock.mock.calls.length === 0; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sinais).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_ENVIO_MS - 1);
    });
    expect(sinais[0].aborted).toBe(false);
    expect(result.current.fotos[0].estado).toEqual({ tipo: "enviando" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2);
    });
    expect(sinais[0].aborted).toBe(true);
    expect(result.current.fotos[0].estado).toEqual({
      tipo: "nao_enviada",
      mensagem: mensagemFoto("nao_enviada"),
      podeTentar: true,
    });
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  it("remover durante o PUT aborta o signal e não gera estado nenhum", async () => {
    prepararMock.mockResolvedValue({ blob: tratado(), formato: "webp" });
    pedirMock.mockResolvedValue(pedidoOk("e1"));
    const sinais = fetchPendurado();
    const { result } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.remover(result.current.fotos[0].chave));
    expect(sinais[0].aborted).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.fotos).toEqual([]);
    expect(result.current.aviso).toBeNull();
    expect(result.current.pendentes).toBe(false);
    expect(confirmarMock).not.toHaveBeenCalled();
  });

  it("desmontar durante o PUT aborta o signal e confirmarEnvio não é chamado", async () => {
    prepararMock.mockResolvedValue({ blob: tratado(), formato: "webp" });
    pedirMock.mockResolvedValue(pedidoOk("e1"));
    const sinais = fetchPendurado();
    const { result, unmount } = renderHook(() => useEnvioFotos());
    act(() => result.current.enviar(arquivo(), AREA));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    expect(sinais[0].aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(confirmarMock).not.toHaveBeenCalled();
  });
});
