// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { violacoesGraves } from "@/test/axe";
import { desmontarTudo, hidratar } from "@/test/hidratar";
import {
  esgotado,
  esperar,
  gravarSacola,
  inexistente,
  instalarConferencia,
  instalarDialogo,
  ok,
  porTexto,
  produto,
  resposta,
  sacolaGravada,
  tocar,
} from "@/test/sacola-tela";

// Feature 006, SF6, T053 (ajuste A1, SC-003) e T056 (D11, US2.7, US2.9, US2.12, US3.5, FR-017,
// FR-018): o envio sempre reconfere; sem conferência válida, nada abre e nada é gravado.

const abrirWhatsapp = vi.hoisted(() => vi.fn());
vi.mock("./navegar", () => ({ abrirWhatsapp }));

const montarPedido = vi.hoisted(() => vi.fn());
vi.mock("@/lib/sacola/mensagem", async (original) => {
  const real = await original<typeof import("@/lib/sacola/mensagem")>();
  montarPedido.mockImplementation(real.montarPedido);
  return { ...real, montarPedido };
});

import { TelaSacola } from "./tela-sacola";

const NUMERO = "+5511999999999";
const ENVIAR = "Enviar pedido pelo WhatsApp";
const FALHA_ENVIO = "Não consegui conferir agora, tente de novo.";
const INDISPONIVEL = "O envio pelo WhatsApp está indisponível no momento. Tente mais tarde.";

const MEIA = produto("Meia", "0042", 600);
const TOUCA = produto("Touca", "0007", 1000);

const botaoEnviar = (c: HTMLElement) => porTexto<HTMLButtonElement>(c, "button", ENVIAR);

// Primeira resposta: a da abertura; depois, a fila `envio`.
function conferencias(abertura: Response, ...envio: (() => Response | Promise<Response>)[]) {
  let n = 0;
  return instalarConferencia(() => {
    n += 1;
    if (n === 1) return abertura;
    const proxima = envio[Math.min(n - 2, envio.length - 1)];
    return proxima();
  });
}

async function abrir(whatsapp: string | null = NUMERO) {
  const r = await hidratar(<TelaSacola whatsapp={whatsapp} />);
  await esperar();
  return r;
}

beforeEach(() => {
  instalarDialogo();
  window.localStorage.clear();
  window.history.replaceState(null, "");
  abrirWhatsapp.mockClear();
  montarPedido.mockClear();
});

afterEach(async () => {
  await desmontarTudo();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "");
});

describe("envio sem conferência válida (T053, ajuste A1)", () => {
  async function prontaParaEnviar(envio: () => Response | Promise<Response>) {
    gravarSacola([{ c: "0042", q: 2 }]);
    const conf = conferencias(resposta([ok("0042", MEIA)]), envio);
    const { container } = await abrir();
    const obs = container.querySelector<HTMLTextAreaElement>("#obs")!;
    expect(botaoEnviar(container)).not.toBeNull();
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const replaceState = vi.spyOn(History.prototype, "replaceState");
    return { container, obs, conf, setItem, removeItem, replaceState };
  }

  function conferirBloqueio(
    container: HTMLElement,
    espias: { setItem: { mock: { calls: unknown[] } }; removeItem: { mock: { calls: unknown[] } }; replaceState: { mock: { calls: unknown[][] } } },
  ) {
    const alerta = container.querySelector('[role="alert"]');
    expect(alerta?.textContent).toBe(FALHA_ENVIO);
    expect(porTexto(container, "button", "Tentar de novo")).toBeNull();
    expect(abrirWhatsapp).not.toHaveBeenCalled();
    expect(espias.replaceState.mock.calls.some(([estado]) => JSON.stringify(estado ?? null).includes("sacolaEnviada"))).toBe(false);
    expect(espias.setItem.mock.calls).toHaveLength(0);
    expect(espias.removeItem.mock.calls).toHaveLength(0);
    expect(sacolaGravada()).toEqual([{ c: "0042", q: 2, p: 600, a: false }]);
    // Lista conferida, resumo e observação continuam.
    expect(porTexto(container, "a", "Meia")).not.toBeNull();
    expect(container.textContent).toContain("Subtotal: R$ 12,00");
    expect(container.querySelector("#obs")).not.toBeNull();
    const botao = botaoEnviar(container)!;
    expect(document.activeElement).toBe(botao);
    expect(botao.hasAttribute("aria-disabled")).toBe(false);
    expect(botao.disabled).toBe(false);
    expect(container.innerHTML).not.toContain("wa.me");
  }

  it("passa de 4 s ⇒ bloqueia com alerta, sem abrir nem gravar", async () => {
    const e = await prontaParaEnviar(() => new Promise<Response>(() => {}));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await act(async () => {
      botaoEnviar(e.container)!.click();
    });
    expect(e.container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    vi.useRealTimers();
    await esperar();
    conferirBloqueio(e.container, e);
  });

  it("falha por rede ⇒ bloqueia", async () => {
    const e = await prontaParaEnviar(() => Promise.reject(new TypeError("Failed to fetch")));
    await tocar(botaoEnviar(e.container));
    conferirBloqueio(e.container, e);
  });

  it("responde 400 ⇒ bloqueia", async () => {
    const e = await prontaParaEnviar(() => resposta([], 400));
    await tocar(botaoEnviar(e.container));
    conferirBloqueio(e.container, e);
  });

  it.each([500, 503])("responde %i ⇒ bloqueia", async (status) => {
    const e = await prontaParaEnviar(() => resposta([], status));
    await tocar(botaoEnviar(e.container));
    conferirBloqueio(e.container, e);
  });

  it("200 fora do esquema (sem um item por código pedido) ⇒ bloqueia", async () => {
    const e = await prontaParaEnviar(() => resposta([]));
    await tocar(botaoEnviar(e.container));
    conferirBloqueio(e.container, e);
  });

  it("o botão de envio é a nova tentativa: 200 sem mudança tira o alerta e abre o WhatsApp", async () => {
    let falhar = true;
    gravarSacola([{ c: "0042", q: 2 }]);
    instalarConferencia(() => {
      if (!falhar) return resposta([ok("0042", MEIA)]);
      return resposta([], 503);
    });
    falhar = false;
    const { container } = await abrir();
    falhar = true;
    await tocar(botaoEnviar(container));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(FALHA_ENVIO);
    falhar = false;
    await tocar(botaoEnviar(container));
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(abrirWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("axe sem violações graves no estado de falha no envio", async () => {
    const e = await prontaParaEnviar(() => resposta([], 500));
    await tocar(botaoEnviar(e.container));
    expect(await violacoesGraves(e.container)).toEqual([]);
  });
});

describe("envio (T056, D11)", () => {
  it("caminho feliz: reconfere, marca o histórico e abre o wa.me na mesma aba (SC-003, US2.7)", async () => {
    // 0042 guardado com preço antigo; 0007 esgotado; 0009 saiu do catálogo.
    gravarSacola([{ c: "0042", q: 2, p: 500 }, { c: "0007" }, { c: "0009" }]);
    const abertura = [ok("0042", MEIA), esgotado("0007", TOUCA), inexistente("0009")];
    const conf = conferencias(resposta(abertura), () => resposta([ok("0042", MEIA), esgotado("0007", TOUCA)]));
    const { container } = await abrir();
    const replaceState = vi.spyOn(History.prototype, "replaceState");

    await tocar(botaoEnviar(container));

    expect(conf.pedidos).toEqual([
      ["0042", "0007", "0009"],
      ["0042", "0007"],
    ]);
    expect(replaceState).toHaveBeenCalledTimes(1);
    expect(replaceState.mock.calls[0][0]).toMatchObject({ sacolaEnviada: true });
    expect(abrirWhatsapp).toHaveBeenCalledTimes(1);
    const url = abrirWhatsapp.mock.calls[0][0] as string;
    expect(url.startsWith("https://wa.me/5511999999999?text=")).toBe(true);
    expect(url.length).toBeLessThanOrEqual(1800);
    const texto = decodeURIComponent(url.split("?text=")[1]);
    expect(texto).toContain("2x Meia (#0042) — R$ 12,00");
    expect(texto).not.toContain("0007");
    expect(texto).not.toContain("0009");
    expect(texto).not.toContain("R$ 10,00");
    expect(container.innerHTML).not.toContain("wa.me");
  });

  it("a observação vai normalizada para a mensagem", async () => {
    gravarSacola([{ c: "0042" }]);
    conferencias(resposta([ok("0042", MEIA)]), () => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    const obs = container.querySelector<HTMLTextAreaElement>("#obs")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      setter.call(obs, "  entregar à tarde\r\n  ");
      obs.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await tocar(botaoEnviar(container));
    const texto = decodeURIComponent((abrirWhatsapp.mock.calls[0][0] as string).split("?text=")[1]);
    expect(texto.endsWith("Observação:\nentregar à tarde")).toBe(true);
  });

  it("mudança na reconferência ⇒ avisos, foco no título e o WhatsApp não abre (US3.5)", async () => {
    gravarSacola([{ c: "0042", q: 2 }]);
    const mais = produto("Meia", "0042", 700);
    conferencias(resposta([ok("0042", MEIA)]), () => resposta([ok("0042", mais)]));
    const { container } = await abrir();

    await tocar(botaoEnviar(container));

    expect(abrirWhatsapp).not.toHaveBeenCalled();
    expect(montarPedido).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(container.querySelector("#sacola-titulo"));
    expect(container.textContent).toContain("O preço mudou desde que você adicionou.");
    expect(container.textContent).toContain("Subtotal: R$ 14,00");
    expect(sacolaGravada()).toEqual([{ c: "0042", q: 2, p: 700, a: false }]);

    // Visto o aviso, o próximo toque envia.
    await tocar(botaoEnviar(container));
    expect(abrirWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("esgotado já exibido na tela não barra o envio (houveMudanca com a conferência exibida)", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    const itens = [ok("0042", MEIA), esgotado("0007", TOUCA)];
    conferencias(resposta(itens), () => resposta(itens));
    const { container } = await abrir();
    await tocar(botaoEnviar(container));
    expect(abrirWhatsapp).toHaveBeenCalledTimes(1);
  });

  it("produto que saiu do catálogo no envio ⇒ aviso de removido e não abre", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    conferencias(resposta([ok("0042", MEIA), ok("0007", TOUCA)]), () =>
      resposta([ok("0042", MEIA), inexistente("0007")]),
    );
    const { container } = await abrir();
    await tocar(botaoEnviar(container));
    expect(abrirWhatsapp).not.toHaveBeenCalled();
    expect(container.textContent).toContain("O produto #0007 não está mais no catálogo.");
    expect(sacolaGravada()?.map((i) => i.c)).toEqual(["0042"]);
  });

  it("número inválido ⇒ aria-disabled, texto ligado, sem href nem wa.me, montarPedido nunca chamado (US2.12)", async () => {
    gravarSacola([{ c: "0042", q: 2 }]);
    const conf = conferencias(resposta([ok("0042", MEIA)]), () => resposta([ok("0042", MEIA)]));
    const { container } = await abrir(null);
    const botao = botaoEnviar(container)!;
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    expect(botao.getAttribute("aria-describedby")).toBe("envio-indisponivel");
    expect(container.querySelector("#envio-indisponivel")?.textContent).toBe(INDISPONIVEL);
    expect(botao.hasAttribute("href")).toBe(false);
    expect(container.querySelector("a[href*='wa.me']")).toBeNull();

    await tocar(botao);
    expect(conf.pedidos).toHaveLength(1);
    expect(montarPedido).not.toHaveBeenCalled();
    expect(abrirWhatsapp).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("wa.me");

    // O resto da sacola funciona.
    await tocar(container.querySelector('[aria-label="Aumentar quantidade de Meia"]'));
    expect(sacolaGravada()).toEqual([{ c: "0042", q: 3, p: 600, a: false }]);
    expect(montarPedido).not.toHaveBeenCalled();
  });

  describe("volta do WhatsApp (US2.9, FR-018)", () => {
    function conferirConfirmacao(container: HTMLElement) {
      expect(container.textContent).toContain("Seu pedido foi aberto no WhatsApp.");
      expect(porTexto<HTMLAnchorElement>(container, "a", "Voltar")?.getAttribute("href")).toBe("/");
      expect(porTexto(container, "button", "Limpar sacola")).not.toBeNull();
      // A lista continua abaixo.
      expect(porTexto(container, "a", "Meia")).not.toBeNull();
      expect(sacolaGravada()).toEqual([{ c: "0042", q: 2, p: 600, a: false }]);
    }

    it("abrir com history.state.sacolaEnviada ⇒ confirmação, sacola intacta", async () => {
      gravarSacola([{ c: "0042", q: 2 }]);
      conferencias(resposta([ok("0042", MEIA)]));
      window.history.replaceState({ sacolaEnviada: true }, "");
      const setItem = vi.spyOn(Storage.prototype, "setItem");
      const { container } = await abrir();
      conferirConfirmacao(container);
      expect(setItem).not.toHaveBeenCalled();
    });

    it("pageshow (bfcache) com sacolaEnviada ⇒ confirmação", async () => {
      gravarSacola([{ c: "0042", q: 2 }]);
      conferencias(resposta([ok("0042", MEIA)]));
      const { container } = await abrir();
      expect(container.textContent).not.toContain("Seu pedido foi aberto no WhatsApp.");
      window.history.replaceState({ sacolaEnviada: true }, "");
      await act(async () => {
        window.dispatchEvent(new Event("pageshow"));
      });
      await esperar();
      conferirConfirmacao(container);
    });

    it("sem a marca no histórico ⇒ sem confirmação", async () => {
      gravarSacola([{ c: "0042", q: 2 }]);
      conferencias(resposta([ok("0042", MEIA)]));
      const { container } = await abrir();
      expect(container.textContent).not.toContain("Seu pedido foi aberto no WhatsApp.");
    });
  });
});
