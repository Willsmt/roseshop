// @vitest-environment jsdom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import { violacoesGraves } from "@/test/axe";
import { desmontarTudo, hidratar, outraAbaGravou } from "@/test/hidratar";
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

// Feature 006, SF6, T054 (CT§3, CT "Foco e anúncios", US2.1–US2.4, US2.11, US3.1–US3.7, US4.4,
// D12, D13, SC-006): estados da /sacola, um por vez.

vi.mock("./navegar", () => ({ abrirWhatsapp: vi.fn() }));

import { TelaSacola } from "./tela-sacola";

const NUMERO = "+5511999999999";
const ENVIAR = "Enviar pedido pelo WhatsApp";
const INDISPONIVEL_NAVEGADOR =
  "Não foi possível abrir a sacola neste navegador. Você ainda pode perguntar por cada produto no WhatsApp.";

const MEIA = produto("Meia", "0042", 600, { capa: { url: "/fotos/a.webp", alt: "Meia — foto 1 de 1" } });
const TOUCA = produto("Touca", "0007", 1000);
const LUVA = produto("Luva", "0010", null);

const enviar = (c: HTMLElement) => porTexto<HTMLButtonElement>(c, "button", ENVIAR);
const aumentar = (c: HTMLElement, nome: string) =>
  c.querySelector<HTMLButtonElement>(`[aria-label="Aumentar quantidade de ${nome}"]`);
const diminuir = (c: HTMLElement, nome: string) =>
  c.querySelector<HTMLButtonElement>(`[aria-label="Diminuir quantidade de ${nome}"]`);
const itemDe = (c: HTMLElement, nome: string) => porTexto(c, "a", nome)?.closest("li") ?? null;
const resumo = (c: HTMLElement) => c.querySelector<HTMLElement>("#sacola-resumo");
const anuncio = (c: HTMLElement) => c.querySelector<HTMLElement>("#sacola-anuncio");

async function abrir(whatsapp: string | null = NUMERO) {
  const r = await hidratar(<TelaSacola whatsapp={whatsapp} />);
  await esperar();
  return r;
}

beforeEach(() => {
  instalarDialogo();
  window.localStorage.clear();
  window.history.replaceState(null, "");
});

afterEach(async () => {
  await desmontarTudo();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("primeiro render", () => {
  it("HTML do servidor vazio, mesmo com sacola gravada", () => {
    gravarSacola([{ c: "0042" }]);
    expect(renderToString(<TelaSacola whatsapp={NUMERO} />)).toBe("");
  });

  it("com armazenamento bloqueado, o texto de indisponível nunca aparece no primeiro render", async () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(renderToString(<TelaSacola whatsapp={NUMERO} />)).toBe("");
    const { html } = await hidratar(<TelaSacola whatsapp={NUMERO} />);
    expect(html).not.toContain("Não foi possível abrir a sacola");
  });
});

describe("estados", () => {
  it("armazenamento indisponível ⇒ <h1>Sacola</h1>, texto próprio e link ao catálogo (US4.4)", async () => {
    const fetch = instalarConferencia(() => resposta([])).fetch;
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    const { container } = await abrir();
    expect(container.querySelector("h1")?.textContent).toBe("Sacola");
    expect(container.textContent).toContain(INDISPONIVEL_NAVEGADOR);
    expect(porTexto(container, "a", "Ver o catálogo")?.getAttribute("href")).toBe("/");
    expect(enviar(container)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("vazia ⇒ #sacola-vazia, link ao catálogo e sem envio (US2.11)", async () => {
    const fetch = instalarConferencia(() => resposta([])).fetch;
    const { container } = await abrir();
    const titulo = container.querySelector("#sacola-vazia");
    expect(titulo?.tagName).toBe("H1");
    expect(titulo?.textContent).toBe("Sua sacola está vazia");
    expect(titulo?.getAttribute("tabindex")).toBe("-1");
    expect(porTexto(container, "a", "Ver o catálogo")?.getAttribute("href")).toBe("/");
    expect(enviar(container)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("conferindo ⇒ status 'Conferindo a sacola…', lista guardada sem preços, envio desabilitado", async () => {
    gravarSacola([{ c: "0042", q: 2 }]);
    instalarConferencia(() => new Promise<Response>(() => {}));
    const { container } = await abrir();
    const status = porTexto(container, '[role="status"]', "Conferindo a sacola…");
    expect(status).not.toBeNull();
    expect(container.textContent).toContain("#0042");
    expect(container.textContent).not.toContain("R$");
    expect(enviar(container)?.getAttribute("aria-disabled")).toBe("true");
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("falha ao abrir ⇒ texto + 'Tentar de novo', envio aria-disabled, nada gravado (US3.7)", async () => {
    gravarSacola([{ c: "0042", q: 2 }]);
    let falhar = true;
    const conf = instalarConferencia(() => (falhar ? resposta([], 503) : resposta([ok("0042", MEIA)])));
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const { container } = await abrir();
    expect(container.textContent).toContain("Não foi possível conferir a sacola agora.");
    const tentar = porTexto(container, "button", "Tentar de novo");
    expect(tentar).not.toBeNull();
    const botao = enviar(container)!;
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(botao.getAttribute("aria-describedby") ?? "")?.textContent).toContain(
      "Não foi possível conferir a sacola agora.",
    );
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(await violacoesGraves(container)).toEqual([]);

    falhar = false;
    await tocar(tentar);
    expect(conf.pedidos).toEqual([["0042"], ["0042"]]);
    expect(container.textContent).toContain("Subtotal: R$ 12,00");
    expect(enviar(container)?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("conferida ⇒ nome com link, código, capa ou 'Sem foto', preço, quantidade, linha e subtotal (US2.1)", async () => {
    gravarSacola([{ c: "0042", q: 2 }, { c: "0007" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), ok("0007", TOUCA)]));
    const { container } = await abrir();
    expect(container.querySelector("#sacola-titulo")?.textContent).toBe("Sacola");
    expect(container.querySelector("#sacola-titulo")?.getAttribute("tabindex")).toBe("-1");
    const meia = itemDe(container, "Meia")!;
    expect(porTexto(meia, "a", "Meia")?.getAttribute("href")).toBe("/p/0042");
    expect(meia.textContent).toContain("#0042");
    expect(meia.querySelector("img")?.getAttribute("alt")).toBe("Meia — foto 1 de 1");
    expect(meia.textContent).toContain("R$ 6,00");
    expect(meia.querySelector("output")?.textContent).toBe("2");
    expect(meia.textContent).toContain("R$ 12,00");
    expect(itemDe(container, "Touca")!.textContent).toContain("Sem foto");
    expect(resumo(container)?.getAttribute("aria-live")).toBe("polite");
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 22,00");
    expect(enviar(container)?.hasAttribute("aria-disabled")).toBe(false);
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("item sem preço ⇒ 'Consulte o valor' e '+ 1 item a consultar'", async () => {
    gravarSacola([{ c: "0042" }, { c: "0010", p: null }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), ok("0010", LUVA)]));
    const { container } = await abrir();
    expect(itemDe(container, "Luva")!.textContent).toContain("Consulte o valor");
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 6,00");
    expect(resumo(container)?.textContent).toContain("+ 1 item a consultar");
  });

  it("esgotado ⇒ 'Esgotado', fora do subtotal, sem quantidade, com 'Remover' (US3.1)", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007", q: 3 }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), esgotado("0007", TOUCA)]));
    const { container } = await abrir();
    const touca = itemDe(container, "Touca")!;
    expect(touca.textContent).toContain("Esgotado");
    expect(touca.querySelector("output")).toBeNull();
    expect(aumentar(container, "Touca")).toBeNull();
    expect(porTexto(touca, "button", "Remover")).not.toBeNull();
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 6,00");
  });

  it("esgotado que volta ⇒ entra no subtotal com a quantidade que tinha (US3.2)", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007", q: 3, p: 1000 }]);
    let disponivel = false;
    instalarConferencia(() =>
      resposta([ok("0042", MEIA), disponivel ? ok("0007", TOUCA) : esgotado("0007", TOUCA)]),
    );
    const primeira = await abrir();
    expect(resumo(primeira.container)?.textContent).toContain("Subtotal: R$ 6,00");
    await desmontarTudo();

    disponivel = true;
    const { container } = await abrir();
    expect(itemDe(container, "Touca")!.querySelector("output")?.textContent).toBe("3");
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 36,00");
  });

  it("inexistente ⇒ sai da sacola e aviso em role=status (US3.3)", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    instalarConferencia(() => resposta([inexistente("0042"), ok("0007", TOUCA)]));
    const { container } = await abrir();
    const aviso = porTexto(container, "p", "O produto #0042 não está mais no catálogo.");
    expect(aviso?.closest('[role="status"]')).not.toBeNull();
    expect(itemDe(container, "Meia")).toBeNull();
    expect(sacolaGravada()?.map((i) => i.c)).toEqual(["0007"]);
  });

  it("todos inexistentes ⇒ vazia, com o aviso", async () => {
    gravarSacola([{ c: "0042" }]);
    instalarConferencia(() => resposta([inexistente("0042")]));
    const { container } = await abrir();
    expect(container.querySelector("#sacola-vazia")).not.toBeNull();
    expect(container.textContent).toContain("O produto #0042 não está mais no catálogo.");
    expect(sacolaGravada()).toBeNull();
  });

  it("preço alterado ⇒ preço atual e aviso junto do item, em role=status (US3.4)", async () => {
    gravarSacola([{ c: "0042", p: 500 }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    const meia = itemDe(container, "Meia")!;
    expect(meia.textContent).toContain("R$ 6,00");
    const aviso = porTexto(meia, "p", "O preço mudou desde que você adicionou.");
    expect(aviso?.closest('[role="status"]')).not.toBeNull();
    expect(sacolaGravada()).toEqual([{ c: "0042", q: 1, p: 600, a: false }]);
  });

  it("todos esgotados ⇒ envio desabilitado com o texto (US3.6)", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    instalarConferencia(() => resposta([esgotado("0042", MEIA), esgotado("0007", TOUCA)]));
    const { container } = await abrir();
    const botao = enviar(container)!;
    expect(botao.getAttribute("aria-disabled")).toBe("true");
    expect(document.getElementById(botao.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      "Todos os produtos da sacola estão esgotados.",
    );
    expect(await violacoesGraves(container)).toEqual([]);
  });
});

describe("quantidade (US2.2)", () => {
  it("'−' disabled em 1, '+' em 10; o subtotal muda no resumo vivo e o foco fica no botão", async () => {
    gravarSacola([{ c: "0042", q: 1 }, { c: "0007", q: 10 }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), ok("0007", TOUCA)]));
    const { container } = await abrir();
    expect(diminuir(container, "Meia")?.disabled).toBe(true);
    expect(aumentar(container, "Touca")?.disabled).toBe(true);

    const mais = aumentar(container, "Meia")!;
    mais.focus();
    await tocar(mais);
    expect(itemDe(container, "Meia")!.querySelector("output")?.textContent).toBe("2");
    expect(itemDe(container, "Meia")!.textContent).toContain("R$ 12,00");
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 112,00");
    expect(document.activeElement).toBe(mais);
    expect(sacolaGravada()?.[0]).toEqual({ c: "0042", q: 2, p: 600, a: false });

    await tocar(diminuir(container, "Meia"));
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 106,00");
  });

  it("falha ao gravar ⇒ aviso em role=alert e nada muda", async () => {
    gravarSacola([{ c: "0042", q: 1 }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("cheio", "QuotaExceededError");
    });
    await tocar(aumentar(container, "Meia"));
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Não foi possível salvar a sacola agora. Tente de novo.",
    );
    expect(itemDe(container, "Meia")!.querySelector("output")?.textContent).toBe("1");
  });
});

describe("remover e limpar (US2.3, US2.4, D12)", () => {
  it("Remover ⇒ foco em #sacola-titulo e anúncio 'Produto removido. Subtotal: …'", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), ok("0007", TOUCA)]));
    const { container } = await abrir();
    await tocar(porTexto(itemDe(container, "Touca")!, "button", "Remover"));
    expect(itemDe(container, "Touca")).toBeNull();
    expect(sacolaGravada()?.map((i) => i.c)).toEqual(["0042"]);
    expect(document.activeElement).toBe(container.querySelector("#sacola-titulo"));
    expect(anuncio(container)?.getAttribute("role")).toBe("status");
    expect(anuncio(container)?.textContent).toBe("Produto removido. Subtotal: R$ 6,00");
  });

  it("remover o último ⇒ vazia, foco em #sacola-vazia e anúncio 'Sacola vazia.'", async () => {
    gravarSacola([{ c: "0042" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    await tocar(porTexto(container, "button", "Remover"));
    expect(document.activeElement).toBe(container.querySelector("#sacola-vazia"));
    expect(anuncio(container)?.textContent).toBe("Sacola vazia.");
    expect(sacolaGravada()).toBeNull();
  });

  it("Limpar sacola abre o <dialog>; Cancelar fecha e devolve o foco ao botão", async () => {
    gravarSacola([{ c: "0042" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    const limpar = porTexto<HTMLButtonElement>(container, "button", "Limpar sacola")!;
    await tocar(limpar);
    const dialogo = container.querySelector("dialog")!;
    expect(dialogo.hasAttribute("open")).toBe(true);
    expect(dialogo.textContent).toContain("Todos os produtos vão sair da sacola.");
    await tocar(porTexto(dialogo, "button", "Cancelar"));
    expect(dialogo.hasAttribute("open")).toBe(false);
    expect(document.activeElement).toBe(limpar);
    expect(sacolaGravada()).toHaveLength(1);
  });

  it("Limpar confirmado ⇒ vazia, foco em #sacola-vazia", async () => {
    gravarSacola([{ c: "0042" }, { c: "0007" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA), ok("0007", TOUCA)]));
    const { container } = await abrir();
    await tocar(porTexto(container, "button", "Limpar sacola"));
    await tocar(porTexto(container.querySelector("dialog")!, "button", "Limpar"));
    expect(sacolaGravada()).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("#sacola-vazia"));
    expect(anuncio(container)?.textContent).toBe("Sacola vazia.");
  });

  it("axe sem violações graves com o diálogo aberto", async () => {
    gravarSacola([{ c: "0042" }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    await tocar(porTexto(container, "button", "Limpar sacola"));
    expect(await violacoesGraves(container)).toEqual([]);
  });
});

describe("outra aba (D13)", () => {
  it("outra aba adiciona um código ⇒ só ele é conferido, e o foco não se move", async () => {
    gravarSacola([{ c: "0042" }]);
    const conf = instalarConferencia((codigos) =>
      resposta(codigos.map((c) => (c === "0042" ? ok(c, MEIA) : ok(c, TOUCA)))),
    );
    const { container } = await abrir();
    const mais = aumentar(container, "Meia")!;
    mais.focus();
    await outraAbaGravou(
      CHAVE,
      JSON.stringify({
        v: 1,
        t: Date.now(),
        i: [
          { c: "0042", q: 1, p: 600, a: false },
          { c: "0007", q: 1, p: 1000, a: false },
        ],
      }),
    );
    await esperar();
    expect(conf.pedidos).toEqual([["0042"], ["0007"]]);
    expect(itemDe(container, "Touca")).not.toBeNull();
    expect(resumo(container)?.textContent).toContain("Subtotal: R$ 16,00");
    expect(document.activeElement).toBe(mais);
  });

  it("outra aba muda a quantidade ⇒ só re-render, sem nova conferência", async () => {
    gravarSacola([{ c: "0042" }]);
    const conf = instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    await outraAbaGravou(CHAVE, JSON.stringify({ v: 1, t: Date.now(), i: [{ c: "0042", q: 4, p: 600, a: false }] }));
    await esperar();
    expect(conf.pedidos).toHaveLength(1);
    expect(itemDe(container, "Meia")!.querySelector("output")?.textContent).toBe("4");
  });
});

describe("teclado (SC-006)", () => {
  it("controles são botões, links e campo nativos, sem tabindex positivo; o diálogo também", async () => {
    gravarSacola([{ c: "0042", q: 2 }]);
    instalarConferencia(() => resposta([ok("0042", MEIA)]));
    const { container } = await abrir();
    await act(async () => {
      porTexto<HTMLButtonElement>(container, "button", "Limpar sacola")!.click();
    });
    for (const el of container.querySelectorAll("[tabindex]")) {
      expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
    }
    for (const el of container.querySelectorAll("[onclick], div[role='button'], span[role='button']")) {
      throw new Error(`controle não nativo: ${el.outerHTML}`);
    }
    for (const b of container.querySelectorAll("button")) expect(b.getAttribute("type")).toBe("button");
    const dialogo = container.querySelector("dialog")!;
    expect(porTexto(dialogo, "button", "Limpar")).not.toBeNull();
    expect(porTexto(dialogo, "button", "Cancelar")).not.toBeNull();
  });
});
