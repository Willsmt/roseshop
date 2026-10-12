// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONFIRMAR_REMOCAO_FOTO,
  MUITOS_PENDENTES_TELA_FOTOS,
  PEDIDO_TROCA,
  SALVANDO,
  SUCESSO_FOTO,
  mensagemFoto,
} from "@/lib/fotos/mensagens";
import type { Conjunto, FotoVista, ResultadoFotos } from "@/lib/fotos/tipos";

// T103 (SF11): tela "Fotos" de um produto existente (US4-AC1..AC7, US5-AC1, FR-020..FR-024).
// As actions, o recorte e o hook de envio são mockados (como no cadastro); ListaFotos, EscolherFoto
// e Aviso são os reais. O hook falso guarda as fotos em estado de React para a tela reagir a
// `concluir()` (foto enviada) sem rede.

type FotoHook = { chave: string; previa: string | null; estado: Record<string, unknown> };

const h = vi.hoisted(() => ({
  AREA: { x: 1, y: 2, lado: 600 },
  conferirArquivo: vi.fn(),
  enviar: vi.fn(),
  removerDoHook: vi.fn(),
  tentarDeNovo: vi.fn(),
  setFotos: null as null | ((f: (l: FotoHook[]) => FotoHook[]) => void),
  setAviso: null as null | ((a: string | null) => void),
  contador: 0,
}));

vi.mock("../../_fotos/usar-envio", async () => {
  const { useState } = await import("react");
  return {
    conferirArquivo: h.conferirArquivo,
    useEnvioFotos: () => {
      const [fotos, setFotos] = useState<FotoHook[]>([]);
      const [aviso, setAviso] = useState<string | null>(null);
      h.setFotos = setFotos;
      h.setAviso = setAviso;
      return {
        fotos,
        envioIds: fotos.flatMap((f) => (f.estado.tipo === "enviada" ? [f.estado.envioId as string] : [])),
        emCurso: fotos.some((f) => f.estado.tipo === "enviando"),
        pendentes: fotos.some((f) => f.estado.tipo !== "enviada"),
        aviso,
        mostrarAviso: vi.fn(),
        limparAviso: () => setAviso(null),
        enviar: (arquivo: File, area: unknown) => {
          h.enviar(arquivo, area);
          h.contador += 1;
          const chave = `foto-${h.contador}`;
          setFotos((l) => [...l, { chave, previa: null, estado: { tipo: "enviando" } }]);
        },
        tentarDeNovo: (c: string) => h.tentarDeNovo(c),
        remover: (c: string) => {
          h.removerDoHook(c);
          setFotos((l) => l.filter((f) => f.chave !== c));
        },
        mover: vi.fn(),
        marcarExpiradas: vi.fn(),
      };
    },
  };
});
vi.mock("../../_fotos/recorte-foto", () => ({
  RecorteFoto: (p: { arquivo: File; onUsar: (a: typeof h.AREA) => void; onCancelar: () => void }) => (
    <div data-testid="recorte" data-arquivo={p.arquivo.name}>
      <button type="button" onClick={() => p.onUsar(h.AREA)}>
        Usar esta foto
      </button>
      <button type="button" onClick={p.onCancelar}>
        Cancelar
      </button>
    </div>
  ),
}));
vi.mock("@/lib/fotos/actions", () => ({
  adicionarFoto: vi.fn(),
  trocarFoto: vi.fn(),
  removerFoto: vi.fn(),
  moverFoto: vi.fn(),
  pedirEnvio: vi.fn(),
  confirmarEnvio: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { adicionarFoto, moverFoto, removerFoto, trocarFoto } from "@/lib/fotos/actions";

import { GerenciarFotos } from "./gerenciar-fotos";

const adicionar = vi.mocked(adicionarFoto);
const trocar = vi.mocked(trocarFoto);
const remover = vi.mocked(removerFoto);
const mover = vi.mocked(moverFoto);

const PRODUTO = 7;
const vista = (nome: string, posicao: number): FotoVista => ({
  posicao,
  arquivo: `${nome}.webp`,
  url: `/painel/fotos/${nome}.webp`,
});
const conjunto = (fotosVersao: number, nomes: string[]): Conjunto => ({
  fotosVersao,
  fotos: nomes.map((n, i) => vista(n, i + 1)),
});
const ok = (c: Conjunto): ResultadoFotos => ({ ok: true, ...c });

let confirmar: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.contador = 0;
  h.conferirArquivo.mockReset().mockResolvedValue(null);
  h.enviar.mockReset();
  h.removerDoHook.mockReset();
  h.tentarDeNovo.mockReset();
  for (const m of [adicionar, trocar, remover, mover]) m.mockReset();
  confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const montar = (inicial: Conjunto) => render(<GerenciarFotos produtoId={PRODUTO} inicial={inicial} />);
const item = (n: number) => screen.getByRole("listitem", { name: `Foto ${n}` });
const botao = (nome: string | RegExp) => screen.getByRole("button", { name: nome });
const arquivo = () => new File([new Uint8Array([0xff, 0xd8, 0xff])], "nova.jpg", { type: "image/jpeg" });

// Escolhe o arquivo, passa pelo recorte e confirma; depois conclui o envio no hook falso.
async function escolherEUsar(envioId = "envio-novo") {
  fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo()] } });
  await screen.findByTestId("recorte");
  fireEvent.click(botao("Usar esta foto"));
  expect(h.enviar).toHaveBeenCalledTimes(1);
  expect(h.enviar.mock.calls[0][1]).toEqual(h.AREA);
  await act(async () => {
    h.setFotos?.((l) => l.map((f) => ({ ...f, estado: { tipo: "enviada", envioId } })));
  });
}

describe("GerenciarFotos — lista (US4-AC1, FR-020)", () => {
  it('mostra as fotos em ordem, "Capa" só na 1ª, src /painel/fotos/<arquivo>', () => {
    montar(conjunto(3, ["a", "b", "c"]));
    ["a", "b", "c"].forEach((n, i) => {
      expect(within(item(i + 1)).getByRole("img", { name: `Foto ${i + 1}` })).toHaveAttribute(
        "src",
        `/painel/fotos/${n}.webp`,
      );
    });
    expect(screen.getAllByText("Capa")).toHaveLength(1);
    expect(within(item(1)).getByText("Capa")).toBeInTheDocument();
  });

  it('nunca mostra botão "Salvar" (as mudanças valem na hora)', () => {
    montar(conjunto(3, ["a", "b"]));
    expect(screen.queryByRole("button", { name: /salvar/i })).toBeNull();
  });

  it("US4-AC4: com 1 foto não há Remover; há Trocar foto e o aviso de que precisa de 1 foto", () => {
    montar(conjunto(1, ["a"]));
    expect(screen.queryByRole("button", { name: "Remover" })).toBeNull();
    expect(botao("Trocar foto")).toBeInTheDocument();
    expect(screen.getByText("O produto precisa de pelo menos 1 foto.")).toBeInTheDocument();
    expect(screen.getByText(mensagemFoto("ultima"))).toBeInTheDocument();
  });

  it("com 2 fotos há Remover e não aparece o texto de última foto", () => {
    montar(conjunto(1, ["a", "b"]));
    expect(screen.getAllByRole("button", { name: "Remover" })).toHaveLength(2);
    expect(screen.queryByText(mensagemFoto("ultima"))).toBeNull();
  });
});

describe("GerenciarFotos — remover (US4-AC3, FR-022)", () => {
  it("pede confirmação com o texto da constante; cancelar ⇒ removerFoto não é chamado", () => {
    montar(conjunto(5, ["a", "b", "c"]));
    confirmar.mockReturnValue(false);
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(confirmar).toHaveBeenCalledWith("Remover esta foto do produto? Ela será apagada.");
    expect(confirmar).toHaveBeenCalledWith(CONFIRMAR_REMOCAO_FOTO);
    expect(remover).not.toHaveBeenCalled();
    expect(screen.queryByText(SUCESSO_FOTO.removida)).toBeNull();
  });

  it('confirmar ⇒ removerFoto({produtoId, fotosVersao, posicao}) e, no ok, lista nova + aviso "Foto removida"', async () => {
    montar(conjunto(5, ["a", "b", "c"]));
    remover.mockResolvedValue(ok(conjunto(6, ["a", "c"])));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(remover).toHaveBeenCalledTimes(1);
    expect(remover).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 5, posicao: 2 });
    const aviso = await screen.findByText("Foto removida");
    expect(aviso).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(within(item(2)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/c.webp");
  });
});

describe("GerenciarFotos — mover e capa (US4-AC2, FR-021)", () => {
  it('"Usar como capa" na foto 3 ⇒ moverFoto de 3 para 1, sem confirm, aviso "Ordem salva", lista devolvida', async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    mover.mockResolvedValue(ok(conjunto(3, ["c", "a", "b"])));
    fireEvent.click(within(item(3)).getByRole("button", { name: "Usar como capa" }));
    expect(mover).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 2, de: 3, para: 1 });
    expect(confirmar).not.toHaveBeenCalled();
    const aviso = await screen.findByText("Ordem salva");
    expect(aviso).toHaveAttribute("role", "status");
    await waitFor(() =>
      expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/c.webp"),
    );
    expect(within(item(1)).getByText("Capa")).toBeInTheDocument();
  });

  it('"Mover para baixo" na foto 1 ⇒ moverFoto de 1 para 2 (posições 1-based)', async () => {
    montar(conjunto(2, ["a", "b"]));
    mover.mockResolvedValue(ok(conjunto(3, ["b", "a"])));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    expect(mover).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 2, de: 1, para: 2 });
    await screen.findByText(SUCESSO_FOTO.ordem);
  });
});

describe("GerenciarFotos — ações em série (US4-AC7)", () => {
  it("a 2ª ação usa a fotosVersao devolvida pela 1ª", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    mover.mockResolvedValueOnce(ok(conjunto(3, ["b", "a", "c"])));
    remover.mockResolvedValueOnce(ok(conjunto(4, ["b", "a"])));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    await screen.findByText(SUCESSO_FOTO.ordem);
    fireEvent.click(within(item(3)).getByRole("button", { name: "Remover" }));
    await screen.findByText(SUCESSO_FOTO.removida);
    expect(mover.mock.calls[0][0]).toMatchObject({ fotosVersao: 2 });
    expect(remover).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 3, posicao: 3 });
  });

  it("com uma action pendente, cliques em mover/remover são ignorados", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    let resolver!: (r: ResultadoFotos) => void;
    mover.mockReturnValueOnce(new Promise<ResultadoFotos>((r) => (resolver = r)));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    // T105a (R3): durante a action os botões da lista ficam disabled
    expect(within(item(2)).getByRole("button", { name: "Mover para baixo" })).toBeDisabled();
    expect(within(item(3)).getByRole("button", { name: "Remover" })).toBeDisabled();
    fireEvent.click(within(item(2)).getByRole("button", { name: "Mover para baixo" }));
    fireEvent.click(within(item(3)).getByRole("button", { name: "Remover" }));
    expect(mover).toHaveBeenCalledTimes(1);
    expect(remover).not.toHaveBeenCalled();
    await act(async () => resolver(ok(conjunto(3, ["b", "a", "c"]))));
    await screen.findByText(SUCESSO_FOTO.ordem);
  });
});

describe("GerenciarFotos — falhas (US5-AC1, FR-024)", () => {
  it("alterado com `atual` ⇒ aviso de erro, lista passa a ser `atual` e a ação seguinte usa atual.fotosVersao", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    mover.mockResolvedValueOnce({
      ok: false,
      motivo: "alterado",
      mensagem: mensagemFoto("alterado"),
      atual: conjunto(9, ["x", "y"]),
    });
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(mensagemFoto("alterado"));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/x.webp");
    expect(within(item(2)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/y.webp");

    remover.mockResolvedValueOnce(ok(conjunto(10, ["x"])));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(remover).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 9, posicao: 2 });
  });

  it("falha sem `atual` ⇒ lista inalterada e mensagem de erro (role alert)", async () => {
    montar(conjunto(2, ["a", "b"]));
    mover.mockResolvedValueOnce({ ok: false, motivo: "falha_geral", mensagem: mensagemFoto("falha_geral") });
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("falha_geral"));
    expect(within(item(1)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/a.webp");
    expect(within(item(2)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/b.webp");
  });

  it("action que lança ⇒ mensagem de falha_geral e lista mantida", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    remover.mockRejectedValueOnce(new Error("rede"));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("falha_geral"));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("uma ação nova limpa o aviso anterior", async () => {
    montar(conjunto(2, ["a", "b"]));
    mover.mockResolvedValueOnce({ ok: false, motivo: "falha_geral", mensagem: mensagemFoto("falha_geral") });
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    await screen.findByRole("alert");
    mover.mockResolvedValueOnce(ok(conjunto(3, ["b", "a"])));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    await screen.findByText(SUCESSO_FOTO.ordem);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("GerenciarFotos — adicionar (US4-AC5, FR-020)", () => {
  it('arquivo → recorte → "Usar esta foto" → adicionarFoto uma vez com envioId e fotosVersao; aviso "Foto adicionada"', async () => {
    montar(conjunto(4, ["a", "b"]));
    adicionar.mockResolvedValue(ok(conjunto(5, ["a", "b", "n"])));
    await escolherEUsar("envio-novo");
    await screen.findByText("Foto adicionada");
    expect(adicionar).toHaveBeenCalledTimes(1);
    expect(adicionar).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 4, envioId: "envio-novo" });
    expect(screen.getByText("Foto adicionada")).toHaveAttribute("role", "status");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(within(item(3)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/n.webp");
    expect(h.removerDoHook).toHaveBeenCalledTimes(1);
  });

  it("antes da foto ficar enviada, adicionarFoto não é chamado", async () => {
    montar(conjunto(4, ["a"]));
    fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo()] } });
    await screen.findByTestId("recorte");
    fireEvent.click(botao("Usar esta foto"));
    expect(adicionar).not.toHaveBeenCalled();
  });

  it("cancelar o recorte volta sem enviar nada", async () => {
    montar(conjunto(4, ["a"]));
    fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo()] } });
    await screen.findByTestId("recorte");
    fireEvent.click(botao("Cancelar"));
    expect(screen.queryByTestId("recorte")).toBeNull();
    expect(h.enviar).not.toHaveBeenCalled();
    expect(adicionar).not.toHaveBeenCalled();
  });

  it("arquivo recusado pela conferência ⇒ aviso de erro com a mensagem do motivo, sem recorte", async () => {
    montar(conjunto(4, ["a"]));
    h.conferirArquivo.mockResolvedValue("formato");
    fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo()] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("formato"));
    expect(screen.queryByTestId("recorte")).toBeNull();
  });

  it('com 3 fotos ⇒ "Máximo de 3 fotos" e a escolha fica indisponível', () => {
    montar(conjunto(4, ["a", "b", "c"]));
    expect(screen.getByText("Máximo de 3 fotos")).toBeInTheDocument();
    expect(botao("Escolher arquivo")).toBeDisabled();
  });
});

describe("GerenciarFotos — trocar (US4-AC6, FR-020)", () => {
  it('"Trocar foto" na foto 2 ⇒ mesmo fluxo ⇒ trocarFoto({posicao: 2, envioId}), sem confirm, aviso "Foto trocada"', async () => {
    montar(conjunto(4, ["a", "b"]));
    trocar.mockResolvedValue(ok(conjunto(5, ["a", "t"])));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Trocar foto" }));
    await escolherEUsar("envio-troca");
    await screen.findByText("Foto trocada");
    expect(trocar).toHaveBeenCalledTimes(1);
    expect(trocar).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 4, posicao: 2, envioId: "envio-troca" });
    expect(adicionar).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
    expect(screen.getByText("Foto trocada")).toHaveAttribute("role", "status");
    expect(within(item(2)).getByRole("img")).toHaveAttribute("src", "/painel/fotos/t.webp");
  });

  it("funciona mesmo com 3 fotos (a escolha não fica indisponível no modo troca)", async () => {
    montar(conjunto(4, ["a", "b", "c"]));
    trocar.mockResolvedValue(ok(conjunto(5, ["a", "b", "t"])));
    fireEvent.click(within(item(3)).getByRole("button", { name: "Trocar foto" }));
    expect(botao("Escolher arquivo")).toBeEnabled();
    await escolherEUsar("envio-troca");
    await screen.findByText("Foto trocada");
    expect(trocar).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 4, posicao: 3, envioId: "envio-troca" });
  });
});

// T105a (SF11): ajustes da revisão R1, R2, R3, R5 e pendentes.
const todosDaLista = () => within(screen.getByRole("list", { name: "Fotos do produto" })).getAllByRole("button");

describe("GerenciarFotos — R1: ações em série também com conferência, envio e troca (T105a)", () => {
  it("durante conferirArquivo pendente, mover/remover ficam indisponíveis e cliques não chamam action", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    h.conferirArquivo.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo()] } });
    await act(async () => {});
    for (const b of todosDaLista()) expect(b).toBeDisabled();
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Remover" }));
    expect(mover).not.toHaveBeenCalled();
    expect(remover).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("mover pendente + foto do hook vira enviada ⇒ adicionarFoto só DEPOIS do mover, com a fotosVersao devolvida", async () => {
    montar(conjunto(2, ["a", "b"]));
    let resolver!: (r: ResultadoFotos) => void;
    mover.mockReturnValueOnce(new Promise<ResultadoFotos>((r) => (resolver = r)));
    adicionar.mockResolvedValue(ok(conjunto(4, ["b", "a", "n"])));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    expect(mover).toHaveBeenCalledTimes(1);
    await act(async () => {
      h.setFotos?.(() => [{ chave: "foto-x", previa: null, estado: { tipo: "enviada", envioId: "envio-x" } }]);
    });
    expect(adicionar).not.toHaveBeenCalled();
    await act(async () => resolver(ok(conjunto(3, ["b", "a"]))));
    await waitFor(() => expect(adicionar).toHaveBeenCalledTimes(1));
    expect(adicionar).toHaveBeenCalledWith({ produtoId: PRODUTO, fotosVersao: 3, envioId: "envio-x" });
    expect(mover.mock.invocationCallOrder[0]).toBeLessThan(adicionar.mock.invocationCallOrder[0]);
  });

  it("modo troca: botões da lista indisponíveis e remoção impossível", () => {
    montar(conjunto(4, ["a", "b", "c"]));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Trocar foto" }));
    expect(screen.getByText(PEDIDO_TROCA(2))).toBeInTheDocument();
    for (const b of todosDaLista()) expect(b).toBeDisabled();
    fireEvent.click(within(item(3)).getByRole("button", { name: "Remover" }));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    fireEvent.click(within(item(3)).getByRole("button", { name: "Trocar foto" }));
    expect(confirmar).not.toHaveBeenCalled();
    expect(remover).not.toHaveBeenCalled();
    expect(mover).not.toHaveBeenCalled();
    expect(screen.getByText(PEDIDO_TROCA(2))).toBeInTheDocument();
  });
});

describe("GerenciarFotos — R2: foco (T105a)", () => {
  it("clicar Trocar foto na foto 2 ⇒ aparece PEDIDO_TROCA(2) e ele recebe o foco", () => {
    montar(conjunto(4, ["a", "b", "c"]));
    fireEvent.click(within(item(2)).getByRole("button", { name: "Trocar foto" }));
    const pedido = screen.getByText(PEDIDO_TROCA(2));
    expect(pedido).toHaveTextContent("Escolha a foto nova para o lugar da foto 2.");
    expect(document.activeElement).toBe(pedido);
  });

  it("depois de uma ação ok, o foco está no aviso (ou ancestral com tabIndex -1 que o contém)", async () => {
    montar(conjunto(2, ["a", "b"]));
    mover.mockResolvedValue(ok(conjunto(3, ["b", "a"])));
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    const aviso = await screen.findByText(SUCESSO_FOTO.ordem);
    await waitFor(() => {
      const ativo = document.activeElement as HTMLElement;
      expect(ativo).not.toBe(document.body);
      expect(ativo === aviso || ativo.contains(aviso)).toBe(true);
      if (ativo !== aviso) expect(ativo.getAttribute("tabindex")).toBe("-1");
    });
  });
});

describe("GerenciarFotos — R3: Salvando… e lista travada (T105a)", () => {
  it("action pendente ⇒ role=status com Salvando… e botões da lista disabled; ao resolver, some", async () => {
    montar(conjunto(2, ["a", "b", "c"]));
    let resolver!: (r: ResultadoFotos) => void;
    mover.mockReturnValueOnce(new Promise<ResultadoFotos>((r) => (resolver = r)));
    expect(screen.queryByText(SALVANDO)).toBeNull();
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    const salvando = await screen.findByText(SALVANDO);
    expect(salvando).toHaveTextContent("Salvando\u2026");
    expect(salvando).toHaveAttribute("role", "status");
    for (const b of todosDaLista()) expect(b).toBeDisabled();
    await act(async () => resolver(ok(conjunto(3, ["b", "a", "c"]))));
    await screen.findByText(SUCESSO_FOTO.ordem);
    expect(screen.queryByText(SALVANDO)).toBeNull();
    for (const b of todosDaLista()) expect(b).toBeEnabled();
  });
});

describe("GerenciarFotos — R5: produto não existe mais (T105a)", () => {
  it("nao_existe ⇒ aviso, sem lista, sem Escolher arquivo, com link Voltar à lista", async () => {
    montar(conjunto(2, ["a", "b"]));
    mover.mockResolvedValueOnce({ ok: false, motivo: "nao_existe", mensagem: mensagemFoto("nao_existe") });
    fireEvent.click(within(item(1)).getByRole("button", { name: "Mover para baixo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(mensagemFoto("nao_existe"));
    expect(screen.queryByRole("list", { name: "Fotos do produto" })).toBeNull();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Escolher arquivo" })).toBeNull();
    const voltar = screen.getByRole("link", { name: "Voltar à lista" });
    expect(voltar).toHaveAttribute("href", "/painel/produtos");
  });
});

describe("GerenciarFotos — muitos_pendentes na tela Fotos (T105a)", () => {
  it("foto do hook nao_enviada com a mensagem de muitos_pendentes ⇒ mostra MUITOS_PENDENTES_TELA_FOTOS, não o texto do cadastro", async () => {
    montar(conjunto(2, ["a"]));
    await act(async () => {
      h.setFotos?.(() => [
        {
          chave: "foto-p",
          previa: null,
          estado: { tipo: "nao_enviada", mensagem: mensagemFoto("muitos_pendentes"), podeTentar: false },
        },
      ]);
    });
    expect(screen.getByText(MUITOS_PENDENTES_TELA_FOTOS)).toBeInTheDocument();
    expect(screen.queryByText(mensagemFoto("muitos_pendentes"))).toBeNull();
  });
});
