// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { medidorObservacao, montarPedido, restanteObservacao } from "@/lib/sacola/mensagem";
import { contarCaracteres, normalizarObservacao } from "@/lib/sacola/observacao";
import type { LinhaPedido } from "@/lib/sacola/total";
import { violacoesGraves } from "@/test/axe";

import { Observacao } from "./observacao";

// Feature 006, SF6, T055 (ajuste A2, CT§3, FR-015a, FR-016, US2.8, US2.13): campo da observação
// com o medidor do espaço. O número codificado nunca aparece; só os testes o conhecem.

const NUMERO = "+5511999999999";
const QUASE_CHEIO = "Espaço da mensagem quase cheio";
const NAO_CABE = "A observação não cabe mais na mensagem. Encurte para enviar.";

const pequena: LinhaPedido[] = [{ quantidade: 1, nome: "Meia", codigo: "0042", precoCentavos: 600, aPartirDe: false }];

// Linhas do pior caso: quantidade 10, código de 10 dígitos, nome de 40 com acento e emoji.
const longas = (n: number): LinhaPedido[] =>
  Array.from({ length: n }, (_, k) => ({
    quantidade: 10,
    nome: `Ação ${"ã".repeat(30)} 👍👍👍👍${k}`.slice(0, 40),
    codigo: String(2_147_483_000 + k),
    precoCentavos: 9_999_999,
    aPartirDe: true,
  }));

function Sonda({ linhas, inicial = "" }: { linhas: LinhaPedido[]; inicial?: string }) {
  const [valor, setValor] = useState(inicial);
  return <Observacao valor={valor} aoMudar={setValor} numero={NUMERO} linhas={linhas} />;
}

const campo = (c: HTMLElement) => c.querySelector<HTMLTextAreaElement>("#obs")!;
const medidor = (c: HTMLElement) => c.querySelector<HTMLElement>("#obs-medidor")!;
const conta = (c: HTMLElement) => c.querySelector<HTMLElement>("#obs-conta")!;

const escrever = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;

async function digitar(el: HTMLTextAreaElement, valor: string) {
  await act(async () => {
    escrever.call(el, valor);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

// Menor quantidade de linhas longas em que a observação vazia ainda está no modo "caracteres",
// mas alguns emojis já passam ao modo "mensagem" (o orçamento da URL passa a mandar).
function cenarioTransicao() {
  for (let n = 15; n >= 1; n--) {
    const linhas = longas(n);
    if (medidorObservacao({ numero: NUMERO, linhas, observacao: "" }).limite === "caracteres") return linhas;
  }
  throw new Error("sem cenário");
}

afterEach(cleanup);

describe("Observacao", () => {
  it("label ligado ao textarea, sem maxLength, com aria-describedby do medidor e da conta", () => {
    const { container } = render(<Sonda linhas={pequena} />);
    const label = container.querySelector("label");
    expect(label?.getAttribute("for")).toBe("obs");
    expect(label?.textContent).toBe("Observação (opcional)");
    expect(campo(container).tagName).toBe("TEXTAREA");
    expect(campo(container).hasAttribute("maxlength")).toBe(false);
    expect(campo(container).getAttribute("aria-describedby")).toBe("obs-medidor obs-conta");
  });

  it("sacola pequena: 'N de 200' conta code points do texto normalizado", async () => {
    const { container } = render(<Sonda linhas={pequena} />);
    expect(medidor(container).textContent).toBe("0 de 200");
    await digitar(campo(container), "  oi\r\n\r\n\r\n👍  ");
    expect(medidor(container).textContent).toBe("5 de 200");
    expect(conta(container).textContent).toBe("");
  });

  it("#obs-medidor sem aria-live; #obs-conta com aria-live=polite", () => {
    const { container } = render(<Sonda linhas={pequena} />);
    expect(medidor(container).hasAttribute("aria-live")).toBe(false);
    expect(conta(container).getAttribute("aria-live")).toBe("polite");
  });

  it("no teto de 200, a entrada que passaria do limite é desfeita", async () => {
    const { container } = render(<Sonda linhas={pequena} />);
    await digitar(campo(container), "a".repeat(200));
    expect(medidor(container).textContent).toBe("200 de 200");
    await digitar(campo(container), "a".repeat(201));
    expect(campo(container).value).toBe("a".repeat(200));
  });

  it("15 produtos longos: troca para 'quase cheio' com <progress>, sem número codificado no DOM", async () => {
    const linhas = cenarioTransicao();
    const { container } = render(<Sonda linhas={linhas} />);
    // O callback roda nas microtarefas do act e esvazia a fila: os registros ficam guardados aqui.
    let pendentes: MutationRecord[] = [];
    const observador = new MutationObserver((r) => pendentes.push(...r));
    observador.observe(conta(container), { childList: true, characterData: true, subtree: true });

    let texto = "";
    let transicoes = 0;
    let modo = medidorObservacao({ numero: NUMERO, linhas, observacao: texto }).limite;
    for (let k = 0; k < 200; k++) {
      const proximo = texto + "👍";
      await digitar(campo(container), proximo);
      if (campo(container).value !== proximo) break; // o campo recusou: chegou ao limite
      texto = proximo;
      const agora = medidorObservacao({ numero: NUMERO, linhas, observacao: texto }).limite;
      const registros = [...pendentes, ...observador.takeRecords()];
      pendentes = [];
      if (agora !== modo) {
        transicoes += 1;
        expect(registros.length).toBeGreaterThan(0);
        expect(conta(container).textContent).toBe(QUASE_CHEIO);
      } else {
        expect(registros).toHaveLength(0);
      }
      modo = agora;
    }
    observador.disconnect();

    expect(transicoes).toBe(1);
    expect(restanteObservacao({ numero: NUMERO, linhas, observacao: texto })).toBeGreaterThanOrEqual(0);
    expect(restanteObservacao({ numero: NUMERO, linhas, observacao: texto + "👍" })).toBeLessThan(0);
    const barra = medidor(container).querySelector("progress");
    expect(barra?.getAttribute("aria-label")).toBe("Espaço da mensagem usado");
    expect(barra?.getAttribute("max")).toBe("100");
    expect(medidor(container).textContent).not.toMatch(/\d/);
    expect(conta(container).textContent).not.toMatch(/\d/);
    expect(await violacoesGraves(container)).toEqual([]);
  });

  it("a sacola cresce e o texto deixa de caber ⇒ excesso exibido, barra cheia, texto não cortado", async () => {
    const linhas = cenarioTransicao();
    const maiores = longas(linhas.length + 1);
    let texto = "";
    while (restanteObservacao({ numero: NUMERO, linhas, observacao: texto + "👍" }) >= 0) texto += "👍";
    expect(restanteObservacao({ numero: NUMERO, linhas: maiores, observacao: texto })).toBeLessThan(0);

    const { container, rerender } = render(<Sonda linhas={linhas} inicial={texto} />);
    expect(conta(container).textContent).toBe(QUASE_CHEIO);
    rerender(<Sonda linhas={maiores} inicial={texto} />);
    expect(conta(container).textContent).toBe(NAO_CABE);
    expect(medidor(container).querySelector("progress")?.getAttribute("value")).toBe("100");
    expect(campo(container).value).toBe(texto);

    // Encurtar é sempre aceito, mesmo ainda em excesso.
    await digitar(campo(container), texto.slice(0, -2));
    expect(campo(container).value).toBe(texto.slice(0, -2));
  });

  it("a mesma entrada suja dá a mesma string no contador, no limite do campo e na mensagem (FR-015a)", async () => {
    const sujo = "  Entregar\u200B à  tarde\r\n\r\n\r\n\u0007ok 👍  ";
    const normal = normalizarObservacao(sujo);
    const { container } = render(<Sonda linhas={pequena} />);
    await digitar(campo(container), sujo);
    // O value do textarea já troca CRLF por LF (HTML); o resto fica bruto.
    expect(campo(container).value).toBe(sujo.replace(/\r\n/g, "\n"));
    expect(medidor(container).textContent).toBe(`${contarCaracteres(normal)} de 200`);
    const pedido = montarPedido({ numero: NUMERO, linhas: pequena, observacao: sujo });
    expect(pedido.tipo === "ok" && pedido.texto.endsWith(`Observação:\n${normal}`)).toBe(true);
  });

  it("recarregar ⇒ campo vazio: nada é guardado no aparelho (US2.8)", async () => {
    const { container } = render(<Sonda linhas={pequena} />);
    await digitar(campo(container), "entregar à tarde");
    cleanup();
    const outro = render(<Sonda linhas={pequena} />);
    expect(campo(outro.container).value).toBe("");
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});
