// Feature 006, SF6: apoio aos testes da página /sacola (jsdom). Sacola gravada no aparelho,
// respostas da conferência e o <dialog> que o jsdom não implementa.
import { act } from "react";
import { vi } from "vitest";

import { CHAVE } from "@/lib/sacola/armazenamento";
import type { ItemConferencia, ProdutoConferido } from "@/lib/sacola/conferencia";

type Guardado = { c: string; q?: number; p?: number | null; a?: boolean };

export function gravarSacola(itens: Guardado[]): void {
  window.localStorage.setItem(
    CHAVE,
    JSON.stringify({ v: 1, t: Date.now(), i: itens.map(({ c, q = 1, p = 600, a = false }) => ({ c, q, p, a })) }),
  );
}

export function sacolaGravada(): { c: string; q: number; p: number | null; a: boolean }[] | null {
  const bruto = window.localStorage.getItem(CHAVE);
  return bruto === null ? null : (JSON.parse(bruto) as { i: { c: string; q: number; p: number | null; a: boolean }[] }).i;
}

export function produto(
  nome: string,
  codigo: string,
  precoCentavos: number | null = 600,
  extra: Partial<ProdutoConferido> = {},
): ProdutoConferido {
  return { nome, href: `/p/${codigo}`, precoCentavos, aPartirDe: false, capa: null, ...extra };
}

export const ok = (codigo: string, p: ProdutoConferido): ItemConferencia => ({ codigo, estado: "ok", produto: p });
export const esgotado = (codigo: string, p: ProdutoConferido): ItemConferencia => ({
  codigo,
  estado: "esgotado",
  produto: p,
});
export const inexistente = (codigo: string): ItemConferencia => ({ codigo, estado: "inexistente" });

export const resposta = (itens: ItemConferencia[], status = 200): Response =>
  new Response(JSON.stringify({ itens }), { status, headers: { "Content-Type": "application/json" } });

// `fetch` global falso da conferência. `responder` recebe os códigos pedidos; `pedidos` guarda cada
// lista de códigos, na ordem dos pedidos.
export function instalarConferencia(responder: (codigos: string[]) => Response | Promise<Response>) {
  const pedidos: string[][] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    const { codigos } = JSON.parse(String(init?.body)) as { codigos: string[] };
    pedidos.push(codigos);
    return responder(codigos);
  });
  vi.stubGlobal("fetch", fetch);
  return { fetch, pedidos };
}

// Deixa as promessas pendentes (fetch, json, setState) andarem dentro do act.
export async function esperar(): Promise<void> {
  for (let k = 0; k < 5; k++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

export async function tocar(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error("elemento ausente");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await esperar();
}

export function porTexto<T extends HTMLElement = HTMLElement>(raiz: Element, seletor: string, texto: string): T | null {
  return ([...raiz.querySelectorAll<T>(seletor)].find((el) => el.textContent?.trim() === texto) ?? null) as T | null;
}

// O jsdom 30 não implementa showModal/close: o mínimo para o atributo `open` e o evento `close`.
export function instalarDialogo(): void {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { __sacola?: true };
  if (proto.__sacola) return;
  proto.__sacola = true;
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
