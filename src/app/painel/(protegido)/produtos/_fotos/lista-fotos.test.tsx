// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mensagemFoto } from "@/lib/fotos/mensagens";

import { ListaFotos } from "./lista-fotos";
import type { FotoLocal } from "./tipos";

// T087 — lista de fotos do cadastro (US1-AC3, AC5, AC6, US2-AC8, FR-022).
// Contrato interno SF9, REVISÃO 2 e REVISÃO 3 (item 4): lista vertical (D5), alça = miniatura (D2), previa null
// enquanto não há blob tratado (D3), correções 8, 9 e 10.

// jsdom 30 tem PointerEvent; o polyfill cobre ambientes sem ele (clientX vem de MouseEvent).
if (typeof window.PointerEvent === "undefined") {
  class PointerEventFalso extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;
    constructor(tipo: string, init: PointerEventInit = {}) {
      super(tipo, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "touch";
      this.isPrimary = init.isPrimary ?? false;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventFalso;
}

const enviada = (chave: string, previa = `blob:${chave}`): FotoLocal => ({
  chave,
  previa,
  estado: { tipo: "enviada", envioId: `envio-${chave}` },
});

const tres: FotoLocal[] = [enviada("a"), enviada("b"), enviada("c")];

let confirmar: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function montar(fotos: FotoLocal[]) {
  const onRemover = vi.fn();
  const onMover = vi.fn();
  const onTentarDeNovo = vi.fn();
  const r = render(
    <ListaFotos fotos={fotos} onRemover={onRemover} onMover={onMover} onTentarDeNovo={onTentarDeNovo} />,
  );
  return { ...r, onRemover, onMover, onTentarDeNovo };
}

const item = (n: number) => screen.getByRole("listitem", { name: `Foto ${n}` });
const itens = () => screen.getAllByRole("listitem");

describe("ListaFotos — miniaturas e capa (US1-AC3, US1-AC5)", () => {
  it('lista "Fotos do produto" com os itens "Foto 1..n" na ordem de fotos', () => {
    montar(tres);
    const lista = screen.getByRole("list", { name: "Fotos do produto" });
    expect(lista.tagName).toBe("OL");
    expect(itens().map((li) => li.getAttribute("aria-label"))).toEqual(["Foto 1", "Foto 2", "Foto 3"]);
  });

  it("cada miniatura é <img> 160x160 com src = previa, na ordem", () => {
    montar(tres);
    ["a", "b", "c"].forEach((chave, i) => {
      const img = within(item(i + 1)).getByRole("img", { name: `Foto ${i + 1}` });
      expect(img).toHaveAttribute("src", `blob:${chave}`);
      expect(img).toHaveAttribute("width", "160");
      expect(img).toHaveAttribute("height", "160");
    });
  });

  it('US1-AC3: o selo "Capa" aparece só na 1ª foto', () => {
    montar(tres);
    expect(within(item(1)).getByText("Capa")).toBeInTheDocument();
    expect(within(item(2)).queryByText("Capa")).toBeNull();
    expect(within(item(3)).queryByText("Capa")).toBeNull();
    expect(screen.getAllByText("Capa")).toHaveLength(1);
  });

  it('US1-AC5: a foto que passa à posição 1 vira a capa (nova ordem ⇒ "Capa" nela)', () => {
    const { rerender, onRemover, onMover, onTentarDeNovo } = montar(tres);
    rerender(
      <ListaFotos
        fotos={[tres[2], tres[0], tres[1]]}
        onRemover={onRemover}
        onMover={onMover}
        onTentarDeNovo={onTentarDeNovo}
      />,
    );
    expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "blob:c");
    expect(within(item(1)).getByText("Capa")).toBeInTheDocument();
    expect(within(item(2)).queryByText("Capa")).toBeNull();
  });
});

describe("ListaFotos — estados do envio (US2-AC8)", () => {
  it('enviando ⇒ "Enviando…"', () => {
    montar([{ chave: "a", previa: "blob:a", estado: { tipo: "enviando" } }]);
    expect(within(item(1)).getByText("Enviando…")).toBeInTheDocument();
    expect(within(item(1)).queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it('D3: previa null + enviando ⇒ espaço reservado com "Enviando…", sem <img>, na alça', () => {
    montar([enviada("a"), { chave: "b", previa: null, estado: { tipo: "enviando" } }]);
    const li = item(2);
    expect(li.querySelector("img")).toBeNull();
    expect(within(li).getByText("Enviando…")).toBeInTheDocument();
    // O espaço reservado ocupa o lugar da miniatura: a alça existe mesmo sem <img>.
    expect(within(li).getByTestId("alca-foto")).toBeInTheDocument();
  });

  it('correção 10: o estado ("Enviando…") fica dentro de role="status"', () => {
    montar([{ chave: "a", previa: null, estado: { tipo: "enviando" } }]);
    expect(within(item(1)).getByRole("status")).toHaveTextContent("Enviando…");
  });

  it('correção 10: "Não enviada" (e a mensagem) ficam dentro de role="status"', () => {
    const msg = mensagemFoto("foto_expirada");
    montar([{ chave: "a", previa: "blob:a", estado: { tipo: "nao_enviada", mensagem: msg, podeTentar: true } }]);
    const status = within(item(1)).getByRole("status");
    expect(status).toHaveTextContent("Não enviada");
    expect(status).toHaveTextContent(msg);
  });

  it('US2-AC8: nao_enviada (falha de rede) ⇒ "Não enviada" + "Tentar de novo" chama onTentarDeNovo(chave)', () => {
    const { onTentarDeNovo } = montar([
      enviada("a"),
      { chave: "b", previa: "blob:b", estado: { tipo: "nao_enviada", mensagem: mensagemFoto("nao_enviada"), podeTentar: true } },
    ]);
    const li = item(2);
    expect(within(li).getAllByText("Não enviada")).toHaveLength(1);
    const tentar = within(li).getByRole("button", { name: "Tentar de novo" });
    expect(tentar).toHaveClass("min-h-12");
    fireEvent.click(tentar);
    expect(onTentarDeNovo).toHaveBeenCalledTimes(1);
    expect(onTentarDeNovo).toHaveBeenCalledWith("b");
    // as já enviadas continuam lá
    expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "blob:a");
    expect(within(item(1)).queryByText("Não enviada")).toBeNull();
  });

  it('nao_enviada com mensagem diferente ⇒ "Não enviada" e a mensagem', () => {
    const msg = mensagemFoto("foto_expirada");
    montar([{ chave: "a", previa: "blob:a", estado: { tipo: "nao_enviada", mensagem: msg, podeTentar: true } }]);
    expect(within(item(1)).getByText("Não enviada")).toBeInTheDocument();
    expect(within(item(1)).getByText(msg)).toBeInTheDocument();
    expect(within(item(1)).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });

  it('muitos_pendentes (previa null, podeTentar false) ⇒ sem <img>, com a mensagem e sem "Tentar de novo"', () => {
    const msg = mensagemFoto("muitos_pendentes");
    const { onTentarDeNovo } = montar([
      { chave: "a", previa: null, estado: { tipo: "nao_enviada", mensagem: msg, podeTentar: false } },
    ]);
    const li = item(1);
    expect(li.querySelector("img")).toBeNull();
    expect(within(li).getByText(msg)).toBeInTheDocument();
    expect(within(li).queryByRole("button", { name: "Tentar de novo" })).toBeNull();
    expect(onTentarDeNovo).not.toHaveBeenCalled();
  });

  it('enviada ⇒ sem "Enviando…" nem "Não enviada"', () => {
    montar([enviada("a")]);
    expect(screen.queryByText("Enviando…")).toBeNull();
    expect(screen.queryByText("Não enviada")).toBeNull();
  });
});

describe("ListaFotos — remover (US1-AC6)", () => {
  it('"Remover" tem nome acessível exatamente "Remover", ícone de lixeira aria-hidden e ≥ 48 px', () => {
    montar(tres);
    const botoes = screen.getAllByRole("button", { name: "Remover" });
    expect(botoes).toHaveLength(3);
    for (const b of botoes) {
      expect(b).toHaveTextContent("Remover");
      expect(b.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(b).toHaveClass("min-h-12");
    }
  });

  it("US1-AC6: tocar em Remover chama onRemover(chave) sem pedir confirmação", () => {
    const { onRemover } = montar(tres);
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(onRemover).toHaveBeenCalledTimes(1);
    expect(onRemover).toHaveBeenCalledWith("b");
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("US1-AC6: depois de remover, as demais sobem de posição (a 2ª vira capa ao sair a 1ª)", () => {
    const { rerender, onRemover, onMover, onTentarDeNovo } = montar(tres);
    fireEvent.click(within(item(1)).getByRole("button", { name: "Remover" }));
    expect(onRemover).toHaveBeenCalledWith("a");
    rerender(
      <ListaFotos fotos={[tres[1], tres[2]]} onRemover={onRemover} onMover={onMover} onTentarDeNovo={onTentarDeNovo} />,
    );
    expect(itens()).toHaveLength(2);
    expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "blob:b");
    expect(within(item(1)).getByText("Capa")).toBeInTheDocument();
    expect(within(item(2)).getByRole("img")).toHaveAttribute("src", "blob:c");
  });

  it('nenhum botão da lista usa a palavra "Tirar"', () => {
    montar([
      ...tres.slice(0, 2),
      { chave: "x", previa: "blob:x", estado: { tipo: "nao_enviada", mensagem: mensagemFoto("nao_enviada"), podeTentar: true } },
    ]);
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/Tirar/);
      expect(b.getAttribute("aria-label") ?? "").not.toMatch(/Tirar/);
    }
  });
});

describe("ListaFotos — mover por toque (FR-022, US1-AC5; D5: lista vertical)", () => {
  it('1º item: sem "Mover para cima" nem "Usar como capa"; com "Mover para baixo"', () => {
    montar(tres);
    const li = item(1);
    expect(within(li).queryByRole("button", { name: "Mover para cima" })).toBeNull();
    expect(within(li).queryByRole("button", { name: "Usar como capa" })).toBeNull();
    expect(within(li).getByRole("button", { name: "Mover para baixo" })).toBeInTheDocument();
  });

  it('último item: sem "Mover para baixo"; com "Mover para cima" e "Usar como capa"', () => {
    montar(tres);
    const li = item(3);
    expect(within(li).queryByRole("button", { name: "Mover para baixo" })).toBeNull();
    expect(within(li).getByRole("button", { name: "Mover para cima" })).toBeInTheDocument();
    expect(within(li).getByRole("button", { name: "Usar como capa" })).toBeInTheDocument();
  });

  it('D5: não há mais "Mover para a esquerda" nem "Mover para a direita"', () => {
    montar(tres);
    expect(screen.queryByRole("button", { name: /esquerda|direita/ })).toBeNull();
  });

  it("uma foto só: nenhum botão de mover", () => {
    montar([enviada("a")]);
    expect(screen.queryByRole("button", { name: /Mover|Usar como capa/ })).toBeNull();
  });

  it("botões chamam onMover(i, i-1), onMover(i, i+1) e onMover(i, 0)", () => {
    const { onMover } = montar(tres);
    fireEvent.click(within(item(2)).getByRole("button", { name: "Mover para cima" }));
    expect(onMover).toHaveBeenLastCalledWith(1, 0);
    fireEvent.click(within(item(2)).getByRole("button", { name: "Mover para baixo" }));
    expect(onMover).toHaveBeenLastCalledWith(1, 2);
    fireEvent.click(within(item(3)).getByRole("button", { name: "Usar como capa" }));
    expect(onMover).toHaveBeenLastCalledWith(2, 0);
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    expect(onMover).toHaveBeenLastCalledWith(0, 1);
    expect(onMover).toHaveBeenCalledTimes(4);
  });

  it("FR-022: todos os botões de mover têm ≥ 48 px (min-h-12)", () => {
    montar(tres);
    const botoes = screen.getAllByRole("button", { name: /Mover para (cima|baixo)|Usar como capa/ });
    expect(botoes).toHaveLength(6);
    for (const b of botoes) expect(b).toHaveClass("min-h-12");
  });

  it("correção 9: os botões da lista usam sm:w-full! (não sm:w-full)", () => {
    montar(tres);
    for (const b of screen.getAllByRole("button")) {
      expect(b).toHaveClass("sm:w-full!");
      expect(b).not.toHaveClass("sm:w-full");
    }
  });
});

describe("ListaFotos — arrasto vertical pela alça (US1-AC5; D2, D5, correção 8)", () => {
  // Itens empilhados: top = i * 200, altura 160 ⇒ centros verticais em 80, 280, 480.
  function posicionar() {
    itens().forEach((li, i) => {
      const top = i * 200;
      vi.spyOn(li, "getBoundingClientRect").mockReturnValue({
        left: 0,
        right: 600,
        top,
        bottom: top + 160,
        width: 600,
        height: 160,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect);
    });
  }
  const alca = (n: number) => within(item(n)).getByTestId("alca-foto");
  // REVISÃO 3 item 4: simula `hasPointerCapture` em qualquer elemento (a implementação pode
  // consultar a alça do arrasto velho ou a nova). `undefined` = API ausente (padrão do jsdom).
  const tinhaCaptura = Object.prototype.hasOwnProperty.call(Element.prototype, "hasPointerCapture");
  function capturaAtiva(regra: ((id: number) => boolean) | undefined) {
    if (regra === undefined) {
      delete (Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture;
      return;
    }
    Object.defineProperty(Element.prototype, "hasPointerCapture", {
      configurable: true,
      writable: true,
      value: vi.fn((id: number) => regra(id)),
    });
  }
  afterEach(() => {
    if (!tinhaCaptura) delete (Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture;
  });
  const toque = (clientY: number, extra: Record<string, unknown> = {}) => ({
    pointerId: 1,
    clientX: 100,
    clientY,
    button: 0,
    isPrimary: true,
    ...extra,
  });

  it("arrastar a 1ª (pela alça) até depois da 3ª ⇒ onMover(0, 2)", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).toHaveBeenCalledTimes(1);
    expect(onMover).toHaveBeenCalledWith(0, 2);
  });

  it("arrastar a 3ª para o topo ⇒ onMover(2, 0)", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(3);
    fireEvent.pointerDown(a, toque(480));
    fireEvent.pointerMove(a, toque(10));
    fireEvent.pointerUp(a, toque(10));
    expect(onMover).toHaveBeenCalledWith(2, 0);
  });

  it("o destino é pelo centro VERTICAL: mover só na horizontal não muda a posição", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(80, { clientX: 5000 }));
    fireEvent.pointerUp(a, toque(80, { clientX: 5000 }));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("arrastar a 1ª até o meio da 2ª/3ª (clientY 300) ⇒ onMover(0, 1)", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(300));
    fireEvent.pointerUp(a, toque(300));
    expect(onMover).toHaveBeenCalledWith(0, 1);
  });

  it("D2: a alça tem touch-none; o <li> e os botões NÃO têm (a página rola)", () => {
    montar(tres);
    for (const li of itens()) {
      expect(li).not.toHaveClass("touch-none");
      expect(li.style.touchAction).not.toBe("none");
      const a = within(li).getByTestId("alca-foto");
      expect(a.classList.contains("touch-none") || a.style.touchAction === "none").toBe(true);
      for (const b of within(li).getAllByRole("button")) expect(b).not.toHaveClass("touch-none");
    }
  });

  it("D2: a miniatura (<img>) fica dentro da alça", () => {
    montar(tres);
    for (const li of itens()) {
      expect(within(li).getByTestId("alca-foto").querySelector("img")).not.toBeNull();
    }
  });

  it("D2: arrastar pelo <li> fora da alça não move", () => {
    const { onMover } = montar(tres);
    posicionar();
    const li = item(1);
    fireEvent.pointerDown(li, toque(80));
    fireEvent.pointerMove(li, toque(500));
    fireEvent.pointerUp(li, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("arrasto curto que não muda a posição ⇒ onMover não é chamado", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(120));
    fireEvent.pointerUp(a, toque(120));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("pointercancel desiste do arrasto ⇒ onMover não é chamado", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    fireEvent.pointerCancel(a, toque(500));
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("correção 8: lostpointercapture desiste do arrasto ⇒ onMover não é chamado", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    fireEvent.lostPointerCapture(a, toque(500));
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("correção 8: clique direito (button 2) não inicia arrasto", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80, { button: 2 }));
    fireEvent.pointerMove(a, toque(500));
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("listitem").filter((li) => li.getAttribute("data-destino") === "true")).toHaveLength(0);
  });

  it("correção 8: ponteiro não primário (isPrimary false) não inicia arrasto", () => {
    const { onMover } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80, { isPrimary: false }));
    fireEvent.pointerMove(a, toque(500, { isPrimary: false }));
    fireEvent.pointerUp(a, toque(500, { isPrimary: false }));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("correção 8 + REVISÃO 3 item 4: um 2º pointerdown durante o arrasto COM captura ativa do 1º é ignorado", () => {
    // jsdom não implementa hasPointerCapture: a captura ativa do ponteiro 1 é simulada.
    capturaAtiva((id) => id === 1);
    const { onMover } = montar(tres);
    posicionar();
    const a1 = alca(1);
    const a3 = alca(3);
    fireEvent.pointerDown(a1, toque(80));
    // 2º dedo/ponteiro na 3ª foto: não toma o lugar do arrasto em curso.
    fireEvent.pointerDown(a3, toque(480, { pointerId: 2 }));
    fireEvent.pointerMove(a3, toque(10, { pointerId: 2 }));
    fireEvent.pointerUp(a3, toque(10, { pointerId: 2 }));
    fireEvent.pointerMove(a1, toque(500));
    fireEvent.pointerUp(a1, toque(500));
    expect(onMover).toHaveBeenCalledTimes(1);
    expect(onMover).toHaveBeenCalledWith(0, 2);
  });

  it.each([
    ["hasPointerCapture ausente", undefined],
    ["hasPointerCapture false", () => false],
  ] as const)(
    "REVISÃO 3 item 4: arrasto do ponteiro 1 perdido (%s) ⇒ pointerdown do ponteiro 2 começa um arrasto novo que funciona",
    (_rotulo, regra) => {
      capturaAtiva(regra);
      const { onMover } = montar(tres);
      posicionar();
      const a1 = alca(1);
      const a2 = alca(2);
      // Ponteiro 1 começa e some: sem pointerup, pointercancel nem lostpointercapture.
      fireEvent.pointerDown(a1, toque(80));
      fireEvent.pointerMove(a1, toque(500));
      // Ponteiro 2 na 2ª foto: descarta o arrasto velho e começa o novo.
      fireEvent.pointerDown(a2, toque(280, { pointerId: 2 }));
      fireEvent.pointerMove(a2, toque(500, { pointerId: 2 }));
      expect(itens().filter((li) => li.getAttribute("data-destino") === "true")).toEqual([item(3)]);
      fireEvent.pointerUp(a2, toque(500, { pointerId: 2 }));
      expect(onMover).toHaveBeenCalledTimes(1);
      expect(onMover).toHaveBeenCalledWith(1, 2);
      // O ponteiro 1 (descartado) não gera mais nada.
      fireEvent.pointerUp(a1, toque(500));
      expect(onMover).toHaveBeenCalledTimes(1);
    },
  );

  it("arrasto perdido não trava a lista: pointerdown do MESMO ponteiro durante o arrasto descarta o velho e começa um novo na alça apertada", () => {
    // Decisão do humano: o fim do arrasto anterior se perdeu (ex.: mouse, pointerup fora da janela).
    const { onMover } = montar(tres);
    posicionar();
    const a1 = alca(1);
    const a3 = alca(3);
    fireEvent.pointerDown(a1, toque(80)); // sem pointerup
    fireEvent.pointerDown(a3, toque(480)); // mesmo ponteiro 1, agora na 3ª foto
    fireEvent.pointerMove(a3, toque(80)); // até o topo (centro do 1º item)
    fireEvent.pointerUp(a3, toque(80));
    expect(onMover).toHaveBeenCalledTimes(1);
    expect(onMover).toHaveBeenCalledWith(2, 0);
    expect(onMover.mock.calls.some(([de]) => de === 0)).toBe(false);
  });

  it.each([
    ["pointercancel", (el: Element, y: number) => fireEvent.pointerCancel(el, toque(y))],
    ["lostpointercapture", (el: Element, y: number) => fireEvent.lostPointerCapture(el, toque(y))],
  ] as const)(
    "depois de %s (sem onMover, sem data-destino sobrando), um novo arrasto do mesmo ponteiro funciona",
    (_rotulo, desistir) => {
      const { onMover } = montar(tres);
      posicionar();
      const a1 = alca(1);
      const destinos = () => itens().filter((li) => li.getAttribute("data-destino") === "true");
      fireEvent.pointerDown(a1, toque(80));
      fireEvent.pointerMove(a1, toque(500));
      expect(destinos()).toEqual([item(3)]);
      desistir(a1, 500);
      expect(destinos()).toHaveLength(0);
      expect(onMover).not.toHaveBeenCalled();
      // Novo arrasto do mesmo ponteiro, agora da 2ª foto para o fim.
      const a2 = alca(2);
      fireEvent.pointerDown(a2, toque(280));
      fireEvent.pointerMove(a2, toque(500));
      expect(destinos()).toEqual([item(3)]);
      fireEvent.pointerUp(a2, toque(500));
      expect(onMover).toHaveBeenCalledTimes(1);
      expect(onMover).toHaveBeenCalledWith(1, 2);
      expect(destinos()).toHaveLength(0);
    },
  );

  it('correção 8: durante o arrasto o <li> de destino tem data-destino="true"; ao soltar, nenhum', () => {
    montar(tres);
    posicionar();
    const a = alca(1);
    const destinos = () => itens().filter((li) => li.getAttribute("data-destino") === "true");
    expect(destinos()).toHaveLength(0);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    expect(destinos()).toEqual([item(3)]);
    fireEvent.pointerMove(a, toque(300));
    expect(destinos()).toEqual([item(2)]);
    fireEvent.pointerUp(a, toque(300));
    expect(destinos()).toHaveLength(0);
  });

  it("correção 8: se fotos.length mudar durante o arrasto, o arrasto é desfeito", () => {
    const { rerender, onMover, onRemover, onTentarDeNovo } = montar(tres);
    posicionar();
    const a = alca(1);
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    // Uma foto sai (ex.: recusa no aparelho) no meio do arrasto.
    rerender(
      <ListaFotos fotos={[tres[0], tres[1]]} onRemover={onRemover} onMover={onMover} onTentarDeNovo={onTentarDeNovo} />,
    );
    posicionar();
    expect(itens().filter((li) => li.getAttribute("data-destino") === "true")).toHaveLength(0);
    fireEvent.pointerMove(item(1).querySelector('[data-testid="alca-foto"]')!, toque(500));
    fireEvent.pointerUp(item(1).querySelector('[data-testid="alca-foto"]')!, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("pointerdown num botão não inicia arrasto", () => {
    const { onMover } = montar(tres);
    posicionar();
    const botao = within(item(1)).getByRole("button", { name: "Mover para baixo" });
    fireEvent.pointerDown(botao, toque(80));
    fireEvent.pointerMove(botao, toque(500));
    fireEvent.pointerUp(botao, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });
});

// T103 (SF11) — extensão da lista para fotos já salvas: "Trocar foto", sem "Remover" e estado "salva".
describe("ListaFotos — fotos salvas e troca (SF11, US4-AC1, US4-AC4, US5-AC1)", () => {
  const salva = (arquivo: string): FotoLocal => ({
    chave: arquivo,
    previa: `/painel/fotos/${arquivo}`,
    estado: { tipo: "salva" },
  });
  const salvas = [salva("a.webp"), salva("b.webp"), salva("c.webp")];

  it('onTrocar presente ⇒ cada item tem o botão "Trocar foto" e o clique chama onTrocar(chave)', () => {
    const onTrocar = vi.fn();
    render(
      <ListaFotos fotos={salvas} onRemover={vi.fn()} onMover={vi.fn()} onTentarDeNovo={vi.fn()} onTrocar={onTrocar} />,
    );
    expect(screen.getAllByRole("button", { name: "Trocar foto" })).toHaveLength(3);
    fireEvent.click(within(item(2)).getByRole("button", { name: "Trocar foto" }));
    expect(onTrocar).toHaveBeenCalledTimes(1);
    expect(onTrocar).toHaveBeenCalledWith("b.webp");
  });

  it('onTrocar ausente (cadastro) ⇒ não há "Trocar foto"', () => {
    montar(tres);
    expect(screen.queryByRole("button", { name: "Trocar foto" })).toBeNull();
  });

  it('podeRemover={false} ⇒ nenhum botão "Remover"', () => {
    render(
      <ListaFotos fotos={[salva("a.webp")]} onRemover={vi.fn()} onMover={vi.fn()} onTentarDeNovo={vi.fn()} podeRemover={false} />,
    );
    expect(screen.queryByRole("button", { name: /Remover/ })).toBeNull();
  });

  it('padrão (podeRemover omitido) ⇒ "Remover" com o texto visível em cada item', () => {
    montar(tres);
    const botoes = screen.getAllByRole("button", { name: "Remover" });
    expect(botoes).toHaveLength(3);
    expect(botoes[0]).toHaveTextContent("Remover");
  });

  it('estado "salva" ⇒ sem "Enviando…" nem "Não enviada"', () => {
    render(<ListaFotos fotos={salvas} onRemover={vi.fn()} onMover={vi.fn()} onTentarDeNovo={vi.fn()} />);
    expect(screen.queryByText("Enviando…")).toBeNull();
    expect(screen.queryByText(mensagemFoto("nao_enviada"))).toBeNull();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("estado salva: o <img> usa a previa /painel/fotos/<arquivo> como src", () => {
    render(<ListaFotos fotos={salvas} onRemover={vi.fn()} onMover={vi.fn()} onTentarDeNovo={vi.fn()} />);
    expect(within(item(1)).getByRole("img", { name: "Foto 1" })).toHaveAttribute("src", "/painel/fotos/a.webp");
    expect(within(item(3)).getByRole("img", { name: "Foto 3" })).toHaveAttribute("src", "/painel/fotos/c.webp");
  });
});

// T105a (SF11, R3): `desabilitado` trava todos os botões do item e o arrasto.
describe("ListaFotos — desabilitado (SF11 T105a, R3)", () => {
  const toque = (clientY: number) => ({ pointerId: 1, clientX: 100, clientY, button: 0, isPrimary: true });

  it("desabilitado ⇒ todos os botões de todos os itens têm disabled e cliques não chamam callbacks", () => {
    const onRemover = vi.fn();
    const onMover = vi.fn();
    const onTrocar = vi.fn();
    const onTentarDeNovo = vi.fn();
    render(
      <ListaFotos
        fotos={[
          enviada("a"),
          enviada("b"),
          { chave: "c", previa: "blob:c", estado: { tipo: "nao_enviada", mensagem: mensagemFoto("foto_expirada"), podeTentar: true } },
        ]}
        onRemover={onRemover}
        onMover={onMover}
        onTentarDeNovo={onTentarDeNovo}
        onTrocar={onTrocar}
        desabilitado
      />,
    );
    const botoes = screen.getAllByRole("button");
    expect(botoes.length).toBeGreaterThanOrEqual(9);
    for (const b of botoes) {
      expect(b).toBeDisabled();
      fireEvent.click(b);
    }
    for (const nome of ["Usar como capa", "Mover para cima", "Mover para baixo", "Remover", "Trocar foto", "Tentar de novo"]) {
      expect(screen.getAllByRole("button", { name: nome }).length).toBeGreaterThan(0);
    }
    expect(onRemover).not.toHaveBeenCalled();
    expect(onMover).not.toHaveBeenCalled();
    expect(onTrocar).not.toHaveBeenCalled();
    expect(onTentarDeNovo).not.toHaveBeenCalled();
  });

  it("desabilitado ⇒ pointerdown na alça não inicia arrasto nem chama onMover", () => {
    const onMover = vi.fn();
    render(<ListaFotos fotos={tres} onRemover={vi.fn()} onMover={onMover} onTentarDeNovo={vi.fn()} desabilitado />);
    const a = within(item(1)).getByTestId("alca-foto");
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    expect(itens().filter((li) => li.getAttribute("data-destino") === "true")).toHaveLength(0);
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).not.toHaveBeenCalled();
  });

  it("padrão (sem desabilitado) ⇒ botões habilitados e arrasto funciona", () => {
    const onMover = vi.fn();
    render(<ListaFotos fotos={tres} onRemover={vi.fn()} onMover={onMover} onTentarDeNovo={vi.fn()} />);
    for (const b of screen.getAllByRole("button")) expect(b).toBeEnabled();
    const a = within(item(1)).getByTestId("alca-foto");
    fireEvent.pointerDown(a, toque(80));
    fireEvent.pointerMove(a, toque(500));
    fireEvent.pointerUp(a, toque(500));
    expect(onMover).toHaveBeenCalledTimes(1);
  });
});
