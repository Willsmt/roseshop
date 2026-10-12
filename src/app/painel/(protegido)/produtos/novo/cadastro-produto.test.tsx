// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T089 (SF9): cadastro em dois passos (Fotos → Dados). O hook de envio e os componentes de
// foto são mockados: aqui se testa só a costura da página (contrato interno da SF9).
// REVISÃO 2: D1 (pendentes), correções 1 (recorte sozinho), 3 ("pequena") e 10 (foco no heading).
// A composição com o hook real fica em cadastro-produto.composicao.test.tsx.

type Foto = { chave: string; previa: string | null; estado: Record<string, unknown> };

const h = vi.hoisted(() => {
  const AREA = { x: 5, y: 6, lado: 700 };
  return {
    AREA,
    envio: null as unknown as {
      fotos: Foto[];
      envioIds: string[];
      emCurso: boolean;
      pendentes: boolean;
      aviso: string | null;
      mostrarAviso: ReturnType<typeof vi.fn>;
      limparAviso: ReturnType<typeof vi.fn>;
      enviar: ReturnType<typeof vi.fn>;
      tentarDeNovo: ReturnType<typeof vi.fn>;
      remover: ReturnType<typeof vi.fn>;
      mover: ReturnType<typeof vi.fn>;
      marcarExpiradas: ReturnType<typeof vi.fn>;
    },
    conferirArquivo: vi.fn(),
    push: vi.fn(),
  };
});

vi.mock("../_fotos/usar-envio", () => ({
  useEnvioFotos: () => h.envio,
  conferirArquivo: h.conferirArquivo,
}));
vi.mock("../_fotos/escolher-foto", () => ({
  EscolherFoto: (p: { quantidade: number; desabilitado?: boolean; onEscolher: (f: File) => void }) => (
    <div data-testid="escolher" data-quantidade={p.quantidade} data-desabilitado={String(Boolean(p.desabilitado))}>
      <input
        data-testid="entrada-arquivo"
        type="file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) p.onEscolher(f);
        }}
      />
    </div>
  ),
}));
vi.mock("../_fotos/recorte-foto", () => ({
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
vi.mock("../_fotos/lista-fotos", () => ({
  ListaFotos: (p: {
    fotos: Foto[];
    onRemover: (c: string) => void;
    onMover: (de: number, para: number) => void;
    onTentarDeNovo: (c: string) => void;
    confirmarRemocao?: boolean;
  }) => (
    <ol data-testid="lista" data-confirmar={String(Boolean(p.confirmarRemocao))}>
      {p.fotos.map((f, i) => (
        <li key={f.chave}>
          <button type="button" onClick={() => p.onRemover(f.chave)}>{`Remover ${f.chave}`}</button>
          <button type="button" onClick={() => p.onTentarDeNovo(f.chave)}>{`Tentar ${f.chave}`}</button>
          <button type="button" onClick={() => p.onMover(i, 0)}>{`Capa ${f.chave}`}</button>
        </li>
      ))}
    </ol>
  ),
}));
vi.mock("@/lib/produtos/actions", () => ({ criarProduto: vi.fn(), editarProduto: vi.fn() }));
vi.mock("@/lib/produtos/sugestao", () => ({ sugerirProduto: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { criarProduto } from "@/lib/produtos/actions";
import { sugerirProduto } from "@/lib/produtos/sugestao";
import { CONTINUAR_COM_NAO_ENVIADA, mensagemFoto } from "@/lib/fotos/mensagens";

import { CadastroProduto } from "./cadastro-produto";

const criarMock = vi.mocked(criarProduto);
const sugerirMock = vi.mocked(sugerirProduto);
const categorias = [{ id: 1, nome: "Meias" }];

const enviada = (n: number): Foto => ({
  chave: `k${n}`,
  previa: `blob:${n}`,
  estado: { tipo: "enviada", envioId: `e${n}` },
});
const enviando = (n: number): Foto => ({ chave: `k${n}`, previa: `blob:${n}`, estado: { tipo: "enviando" } });
const naoEnviada = (n: number): Foto => ({
  chave: `k${n}`,
  previa: `blob:${n}`,
  estado: { tipo: "nao_enviada", mensagem: mensagemFoto("nao_enviada"), podeTentar: true },
});

function novoEnvio(parcial: Partial<typeof h.envio> = {}) {
  h.envio = {
    fotos: [],
    envioIds: [],
    emCurso: false,
    pendentes: false,
    aviso: null,
    mostrarAviso: vi.fn(),
    limparAviso: vi.fn(),
    enviar: vi.fn(),
    tentarDeNovo: vi.fn(),
    remover: vi.fn(),
    mover: vi.fn(),
    marcarExpiradas: vi.fn(),
    ...parcial,
  };
}

const continuar = () => screen.getByRole("button", { name: "Continuar" });
const escondido = (heading: string) =>
  screen.getByRole("heading", { name: heading, hidden: true }).closest("[hidden]") !== null;

function escolher(arquivo: File) {
  fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [arquivo] } });
}
const foto = (nome = "foto.jpg") => new File([new Uint8Array([0xff, 0xd8, 0xff])], nome, { type: "image/jpeg" });

beforeEach(() => {
  novoEnvio();
  h.conferirArquivo.mockReset();
  h.push.mockReset();
  criarMock.mockReset();
  sugerirMock.mockReset();
  sugerirMock.mockReturnValue(new Promise(() => {})); // por padrão, a sugestão nunca chega
});
afterEach(cleanup);

describe("CadastroProduto — passo Fotos e 'Continuar' (US1-AC1, US1-AC3)", () => {
  it("US1-AC1: começa no passo Fotos; sem foto enviada 'Continuar' fica indisponível", () => {
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument();
    expect(escondido("Fotos")).toBe(false);
    expect(escondido("Dados do produto")).toBe(true);
    expect(continuar()).toBeDisabled();
  });

  it("com envio em curso 'Continuar' fica indisponível mesmo com foto enviada", () => {
    novoEnvio({ fotos: [enviada(1), enviando(2)], envioIds: ["e1"], emCurso: true, pendentes: true });
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeDisabled();
  });

  it("D1: com alguma foto nao_enviada 'Continuar' fica indisponível mesmo com outra enviada e nada em curso", () => {
    novoEnvio({ fotos: [enviada(1), naoEnviada(2)], envioIds: ["e1"], emCurso: false, pendentes: true });
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeDisabled();
  });

  it("US1-AC3: com ≥ 1 foto enviada e nenhum envio em curso, 'Continuar' fica disponível", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeEnabled();
  });

  it("correção 10: 'Continuar' leva o foco ao heading \"Dados do produto\" (tabIndex -1)", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    const heading = screen.getByRole("heading", { name: "Dados do produto" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(heading);
  });

  it("correção 10: 'Voltar às fotos' leva o foco ao heading \"Fotos\" (tabIndex -1)", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    const heading = screen.getByRole("heading", { name: "Fotos" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(document.activeElement).toBe(heading);
  });

  it("'Continuar' ⇒ passo Dados visível e passo Fotos escondido", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    expect(screen.getByRole("heading", { name: "Dados do produto" })).toBeInTheDocument();
    expect(escondido("Dados do produto")).toBe(false);
    expect(escondido("Fotos")).toBe(true);
    expect(screen.queryByRole("heading", { name: "Fotos" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nome do produto")).toBeVisible();
  });

  it("'Voltar às fotos' e 'Continuar' de novo mantêm o digitado", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Meia lisa" } });
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument();
    expect(escondido("Dados do produto")).toBe(true);
    fireEvent.click(continuar());
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("Meia lisa");
  });

  it("recarregar começa vazio: novo render volta ao passo Fotos sem o digitado e nada vai para storage", () => {
    const gravar = vi.spyOn(Storage.prototype, "setItem");
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    const primeiro = render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    fireEvent.change(screen.getByLabelText("Nome do produto"), { target: { value: "Meia lisa" } });
    primeiro.unmount();

    novoEnvio();
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument();
    expect(escondido("Dados do produto")).toBe(true);
    expect(screen.getByLabelText("Nome do produto")).toHaveValue("");
    expect(continuar()).toBeDisabled();
    expect(gravar).not.toHaveBeenCalled();
    gravar.mockRestore();
  });
});

describe("CadastroProduto — escolher e recortar (US1-AC2, US2-AC3, US2-AC7)", () => {
  it.each(["formato", "nao_abre", "pequena"] as const)(
    "conferirArquivo '%s' ⇒ mostrarAviso e o recorte não abre",
    async (motivo) => {
      h.conferirArquivo.mockResolvedValue(motivo);
      render(<CadastroProduto categorias={categorias} />);
      const a = foto();
      escolher(a);
      await waitFor(() => expect(h.envio.mostrarAviso).toHaveBeenCalledWith(motivo));
      expect(h.envio.limparAviso).toHaveBeenCalled();
      expect(h.conferirArquivo).toHaveBeenCalledWith(a);
      expect(screen.queryByTestId("recorte")).not.toBeInTheDocument();
      expect(h.envio.enviar).not.toHaveBeenCalled();
    },
  );

  it("arquivo aceito ⇒ abre o recorte com o arquivo; nada é enviado antes de 'Usar esta foto'", async () => {
    h.conferirArquivo.mockResolvedValue(null);
    render(<CadastroProduto categorias={categorias} />);
    const a = foto("minha.jpg");
    escolher(a);
    const recorte = await screen.findByTestId("recorte");
    expect(recorte).toHaveAttribute("data-arquivo", "minha.jpg");
    expect(h.envio.mostrarAviso).not.toHaveBeenCalled();
    expect(h.envio.enviar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Usar esta foto" }));
    expect(h.envio.enviar).toHaveBeenCalledTimes(1);
    expect(h.envio.enviar.mock.calls[0][0]).toBe(a);
    expect(h.envio.enviar.mock.calls[0][1]).toEqual(h.AREA);
    expect(screen.queryByTestId("recorte")).not.toBeInTheDocument();
    expect(screen.getByTestId("escolher")).toHaveAttribute("data-desabilitado", "false");
  });

  it("correção 1: com o recorte aberto, lista, escolha e 'Continuar' saem do documento; voltam ao cancelar", async () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"], aviso: mensagemFoto("formato") });
    h.conferirArquivo.mockResolvedValue(null);
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByTestId("lista")).toBeInTheDocument();
    escolher(foto());
    await screen.findByTestId("recorte");
    expect(screen.queryByTestId("lista")).toBeNull();
    expect(screen.queryByTestId("escolher")).toBeNull();
    expect(screen.queryByTestId("entrada-arquivo")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continuar" })).toBeNull();
    // Continuam: o heading do passo e o aviso.
    expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(mensagemFoto("formato"));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("recorte")).toBeNull();
    expect(screen.getByTestId("lista")).toBeInTheDocument();
    expect(screen.getByTestId("escolher")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("correção 1: depois de 'Usar esta foto' a lista, a escolha e 'Continuar' voltam", async () => {
    h.conferirArquivo.mockResolvedValue(null);
    render(<CadastroProduto categorias={categorias} />);
    escolher(foto());
    await screen.findByTestId("recorte");
    expect(screen.queryByTestId("lista")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Usar esta foto" }));
    expect(screen.getByTestId("lista")).toBeInTheDocument();
    expect(screen.getByTestId("escolher")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
  });

  it("'Cancelar' no recorte fecha sem enviar", async () => {
    h.conferirArquivo.mockResolvedValue(null);
    render(<CadastroProduto categorias={categorias} />);
    escolher(foto());
    await screen.findByTestId("recorte");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByTestId("recorte")).not.toBeInTheDocument();
    expect(h.envio.enviar).not.toHaveBeenCalled();
  });

  it("EscolherFoto recebe a quantidade de fotos (US1-AC4 é do componente)", () => {
    novoEnvio({ fotos: [enviada(1), enviada(2), enviada(3)], envioIds: ["e1", "e2", "e3"] });
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByTestId("escolher")).toHaveAttribute("data-quantidade", "3");
  });

  it("o aviso do hook aparece num Aviso de erro", () => {
    novoEnvio({ aviso: mensagemFoto("formato") });
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByRole("alert")).toHaveTextContent(mensagemFoto("formato"));
  });
});

describe("CadastroProduto — REVISÃO 3, item 1 (N1): texto sob o 'Continuar' com foto não enviada", () => {
  const muitosPendentes = (n: number): Foto => ({
    chave: `k${n}`,
    previa: null,
    estado: { tipo: "nao_enviada", mensagem: mensagemFoto("muitos_pendentes"), podeTentar: false },
  });

  it.each([
    ["nao_enviada com podeTentar", naoEnviada(2)],
    ["nao_enviada sem podeTentar (muitos_pendentes)", muitosPendentes(2)],
  ])(
    "N1: %s + outra enviada ⇒ CONTINUAR_COM_NAO_ENVIADA aparece e o 'Continuar' aponta para ele (aria-describedby)",
    (_rotulo, pendente) => {
      novoEnvio({ fotos: [enviada(1), pendente], envioIds: ["e1"], emCurso: false, pendentes: true });
      render(<CadastroProduto categorias={categorias} />);
      const texto = screen.getByText(CONTINUAR_COM_NAO_ENVIADA);
      expect(continuar()).toBeDisabled();
      const ids = (continuar().getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean);
      expect(ids.length).toBeGreaterThan(0);
      expect(texto.id).not.toBe("");
      expect(ids).toContain(texto.id);
      expect(continuar()).toHaveAccessibleDescription(CONTINUAR_COM_NAO_ENVIADA);
    },
  );

  it("N1: só com foto enviando (nenhuma nao_enviada) o texto não aparece", () => {
    novoEnvio({ fotos: [enviada(1), enviando(2)], envioIds: ["e1"], emCurso: true, pendentes: true });
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeDisabled();
    expect(screen.queryByText(CONTINUAR_COM_NAO_ENVIADA)).toBeNull();
  });

  it("N1: sem foto nenhuma o texto não aparece", () => {
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeDisabled();
    expect(screen.queryByText(CONTINUAR_COM_NAO_ENVIADA)).toBeNull();
  });

  it("N1: com todas enviadas o texto não aparece", () => {
    novoEnvio({ fotos: [enviada(1), enviada(2)], envioIds: ["e1", "e2"] });
    render(<CadastroProduto categorias={categorias} />);
    expect(continuar()).toBeEnabled();
    expect(screen.queryByText(CONTINUAR_COM_NAO_ENVIADA)).toBeNull();
  });
});

describe("CadastroProduto — REVISÃO 3, item 2: foco ao fechar o recorte", () => {
  it.each(["Usar esta foto", "Cancelar"])("item 2: '%s' fecha o recorte e o foco vai ao heading \"Fotos\"", async (botao) => {
    h.conferirArquivo.mockResolvedValue(null);
    render(<CadastroProduto categorias={categorias} />);
    escolher(foto());
    await screen.findByTestId("recorte");
    const alvo = screen.getByRole("button", { name: botao });
    alvo.focus();
    fireEvent.click(alvo);
    expect(screen.queryByTestId("recorte")).toBeNull();
    const heading = screen.getByRole("heading", { name: "Fotos" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});

describe("CadastroProduto — lista de fotos (US1-AC5, US1-AC6, US2-AC8)", () => {
  it("lista ligada a remover, mover e tentarDeNovo; remoção sem confirmação no cadastro", () => {
    novoEnvio({ fotos: [enviada(1), enviada(2)], envioIds: ["e1", "e2"] });
    render(<CadastroProduto categorias={categorias} />);
    expect(screen.getByTestId("lista")).toHaveAttribute("data-confirmar", "false");
    fireEvent.click(screen.getByRole("button", { name: "Remover k1" }));
    expect(h.envio.remover).toHaveBeenCalledWith("k1");
    fireEvent.click(screen.getByRole("button", { name: "Capa k2" }));
    expect(h.envio.mover).toHaveBeenCalledWith(1, 0);
    fireEvent.click(screen.getByRole("button", { name: "Tentar k2" }));
    expect(h.envio.tentarDeNovo).toHaveBeenCalledWith("k2");
  });
});

describe("CadastroProduto — passo Dados (US1-AC7, edge cases de envio e expiração)", () => {
  it("US1-AC7: o formulário leva os envioIds como campos ocultos `fotos`, na ordem", () => {
    novoEnvio({ fotos: [enviada(2), enviada(1)], envioIds: ["e2", "e1"] });
    const { container } = render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    const campos = [...container.querySelectorAll<HTMLInputElement>('input[name="fotos"]')];
    expect(campos.map((c) => c.value)).toEqual(["e2", "e1"]);
    expect(campos.every((c) => c.type === "hidden")).toBe(true);
  });

  it("'Salvar' indisponível enquanto houver envio em curso", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    const { rerender } = render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    novoEnvio({ fotos: [enviada(1), enviando(2)], envioIds: ["e1"], emCurso: true, pendentes: true });
    rerender(<CadastroProduto categorias={categorias} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("D1: envioEmCurso do formulário = pendentes ('Salvar' indisponível com foto nao_enviada, nada em curso)", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    const { rerender } = render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    novoEnvio({ fotos: [enviada(1), naoEnviada(2)], envioIds: ["e1"], emCurso: false, pendentes: true });
    rerender(<CadastroProduto categorias={categorias} />);
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("foto_expirada ⇒ marcarExpiradas(envioIds) e volta ao passo Fotos", async () => {
    novoEnvio({ fotos: [enviada(1), enviada(2)], envioIds: ["e1", "e2"] });
    criarMock.mockResolvedValue({
      ok: false,
      motivo: "foto_expirada",
      mensagem: mensagemFoto("foto_expirada"),
      envioIds: ["e2"],
      valores: { nome: "Meia", categoriaId: "1", descricao: "", preco: "", aPartirDe: false },
    } as never);
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.envio.marcarExpiradas).toHaveBeenCalledWith(["e2"]));
    expect(h.envio.marcarExpiradas).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Fotos" })).toBeInTheDocument());
    expect(escondido("Dados do produto")).toBe(true);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("correção 10: ao voltar por foto_expirada, o foco vai ao heading \"Fotos\"", async () => {
    novoEnvio({ fotos: [enviada(1), enviada(2)], envioIds: ["e1", "e2"] });
    criarMock.mockResolvedValue({
      ok: false,
      motivo: "foto_expirada",
      mensagem: mensagemFoto("foto_expirada"),
      envioIds: ["e2"],
      valores: { nome: "Meia", categoriaId: "1", descricao: "", preco: "", aPartirDe: false },
    } as never);
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(h.envio.marcarExpiradas).toHaveBeenCalledWith(["e2"]));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Fotos" })));
  });

  it("passo Dados usa o formulário com as categorias", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    expect(screen.getByRole("option", { name: "Meias" })).toBeInTheDocument();
  });
});

// T136 (SF14): sugestão da IA no passo Dados. Contrato interno da SF14, seções 2 e 3.
describe("sugestão (SF14)", () => {
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
  const MARCADOR = "Sugestão \u2014 confira";
  const ESPERANDO = "Preenchendo a partir das fotos\u2026";
  const MSG_INDISPONIVEL = "Não deu para sugerir agora. Preencha você mesma.";
  const MSG_PAUSADA = "As sugestões estão pausadas por agora. Preencha você mesma.";
  const SUGESTAO = { nome: "Meia lisa", categoriaId: 1, descricao: "Meia de algodão" };
  const ok = (sugestao: { nome: string | null; categoriaId: number | null; descricao: string | null } = SUGESTAO): Resposta => ({
    ok: true,
    sugestao,
  });
  const indisponivel = (): Resposta => ({ ok: false, motivo: "ia_indisponivel", mensagem: MSG_INDISPONIVEL });
  const pausada = (): Resposta => ({ ok: false, motivo: "ia_pausada", mensagem: MSG_PAUSADA });

  const nome = () => screen.getByLabelText("Nome do produto") as HTMLInputElement;
  const categoria = () => screen.getByRole("combobox", { name: "Categoria" }) as unknown as HTMLSelectElement;
  const descricao = () => screen.getByLabelText("Descrição") as HTMLTextAreaElement;
  const preco = () => screen.getByLabelText("Preço") as HTMLInputElement;
  const aPartirDe = () => screen.getByLabelText(/a partir de/i) as HTMLInputElement;

  function irParaDados(ids = ["e1", "e2"]) {
    novoEnvio({ fotos: ids.map((_, i) => enviada(i + 1)), envioIds: ids });
    const r = render(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    return r;
  }

  it("US3-AC1: 'Continuar' abre o passo Dados na hora, editável, com \"Preenchendo a partir das fotos…\"; pede 1 vez, na ordem", () => {
    irParaDados(["e2", "e1"]);
    expect(escondido("Dados do produto")).toBe(false);
    expect(nome()).toBeVisible();
    expect(nome()).toBeEnabled();
    expect(categoria()).toBeEnabled();
    expect(descricao()).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(ESPERANDO);
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    expect(sugerirMock).toHaveBeenCalledWith({ envioIds: ["e2", "e1"] });
  });

  it("US3-AC1: nenhuma chamada antes de 'Continuar'", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    expect(sugerirMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status", { hidden: true })).toBeEmptyDOMElement();
  });

  it("FR-027: digitar durante a espera funciona, inclusive escolher a categoria", () => {
    sugerirMock.mockReturnValue(deferred().promise);
    irParaDados();
    fireEvent.change(nome(), { target: { value: "Minha meia" } });
    fireEvent.change(categoria(), { target: { value: "1" } });
    fireEvent.change(descricao(), { target: { value: "Texto meu" } });
    fireEvent.change(preco(), { target: { value: "1290" } });
    expect(nome()).toHaveValue("Minha meia");
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Texto meu");
    expect(preco().value).toBe("12,90");
  });

  it("voltar às fotos e 'Continuar' de novo (mesmas fotos) NÃO chama de novo", () => {
    irParaDados();
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    fireEvent.click(continuar());
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });

  it("voltar, trocar as fotos (envioIds diferentes) e 'Continuar' de novo NÃO chama de novo", () => {
    const { rerender } = irParaDados(["e1", "e2"]);
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    novoEnvio({ fotos: [enviada(9)], envioIds: ["e9"] });
    rerender(<CadastroProduto categorias={categorias} />);
    fireEvent.click(continuar());
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });

  it("voltar e 'Continuar' de novo depois da sugestão pronta não repete nem apaga o que veio", async () => {
    sugerirMock.mockResolvedValue(ok());
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    fireEvent.click(continuar());
    expect(sugerirMock).toHaveBeenCalledTimes(1);
    expect(nome()).toHaveValue("Meia lisa");
  });

  it("US3-AC2: sugestão ok ⇒ nome, categoria e descrição preenchidos com 'Sugestão — confira' ligado por aria-describedby; preço vazio e 'a partir de' desmarcado", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    irParaDados();
    d.resolve(ok());
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Meia de algodão");
    for (const campo of [nome(), categoria(), descricao()]) {
      expect(campo).toHaveAccessibleDescription(MARCADOR);
    }
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
    expect(preco().value).toBe("");
    expect(aPartirDe()).not.toBeChecked();
    expect(screen.getByRole("status")).not.toHaveTextContent(ESPERANDO);
  });

  it("US3-AC3: campo já digitado antes da chegada não muda e não ganha marcador; os vazios são preenchidos", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    irParaDados();
    fireEvent.change(nome(), { target: { value: "Minha meia" } });
    d.resolve(ok());
    await waitFor(() => expect(descricao()).toHaveValue("Meia de algodão"));
    expect(nome()).toHaveValue("Minha meia");
    expect(nome()).toHaveAccessibleDescription("");
    expect(categoria()).toHaveValue("1");
    expect(categoria()).toHaveAccessibleDescription(MARCADOR);
    expect(descricao()).toHaveAccessibleDescription(MARCADOR);
    expect(screen.getAllByText(MARCADOR)).toHaveLength(2);
  });

  it("US3-AC3: categoria escolhida e descrição digitada antes da chegada também ficam como estão", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    irParaDados();
    fireEvent.change(categoria(), { target: { value: "1" } });
    fireEvent.change(descricao(), { target: { value: "Minha descrição" } });
    d.resolve(ok());
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(descricao()).toHaveValue("Minha descrição");
    expect(descricao()).toHaveAccessibleDescription("");
    expect(categoria()).toHaveAccessibleDescription("");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(1);
  });

  it("o marcador de um campo some quando a pessoa o edita; os outros ficam", async () => {
    sugerirMock.mockResolvedValue(ok());
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    fireEvent.change(nome(), { target: { value: "Meia lisa 2" } });
    expect(nome()).toHaveAccessibleDescription("");
    expect(categoria()).toHaveAccessibleDescription(MARCADOR);
    expect(descricao()).toHaveAccessibleDescription(MARCADOR);
    expect(screen.getAllByText(MARCADOR)).toHaveLength(2);
  });

  it.each([
    ["id fora das opções", 99],
    ["null", null],
  ])("US3-AC4: categoriaId %s ⇒ select em vazio, sem marcador; nome e descrição seguem", async (_n, categoriaId) => {
    sugerirMock.mockResolvedValue(ok({ nome: "Meia lisa", categoriaId, descricao: "Meia de algodão" }));
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(categoria()).toHaveValue("");
    expect(categoria()).toHaveAccessibleDescription("");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(2);
  });

  it("sugestão com nome e descrição null não preenche nem marca esses campos", async () => {
    sugerirMock.mockResolvedValue(ok({ nome: null, categoriaId: 1, descricao: null }));
    irParaDados();
    await waitFor(() => expect(categoria()).toHaveValue("1"));
    expect(nome()).toHaveValue("");
    expect(descricao()).toHaveValue("");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(1);
  });

  it("US3-AC6: ia_indisponivel ⇒ mensagem + 'Tentar sugestão de novo'; o botão chama de novo e, no sucesso, preenche", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    irParaDados(["e1", "e2"]);
    expect(await screen.findByText(MSG_INDISPONIVEL)).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(ESPERANDO);

    const d = deferred();
    sugerirMock.mockReturnValueOnce(d.promise);
    fireEvent.click(screen.getByRole("button", { name: "Tentar sugestão de novo" }));
    expect(sugerirMock).toHaveBeenCalledTimes(2);
    expect(sugerirMock).toHaveBeenLastCalledWith({ envioIds: ["e1", "e2"] });
    expect(screen.getByRole("status")).toHaveTextContent(ESPERANDO);
    expect(screen.queryByText(MSG_INDISPONIVEL)).toBeNull();

    d.resolve(ok());
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(categoria()).toHaveValue("1");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "Tentar sugestão de novo" })).toBeNull();
    expect(screen.queryByText(MSG_INDISPONIVEL)).toBeNull();
  });

  it("tentar de novo usa os envioIds atuais (fotos trocadas depois da falha)", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    const { rerender } = irParaDados(["e1", "e2"]);
    await screen.findByText(MSG_INDISPONIVEL);
    novoEnvio({ fotos: [enviada(5), enviada(6), enviada(7)], envioIds: ["e5", "e6", "e7"] });
    rerender(<CadastroProduto categorias={categorias} />);
    sugerirMock.mockReturnValueOnce(deferred().promise);
    fireEvent.click(screen.getByRole("button", { name: "Tentar sugestão de novo" }));
    expect(sugerirMock).toHaveBeenLastCalledWith({ envioIds: ["e5", "e6", "e7"] });
  });

  it("US3-AC6: action que rejeita ⇒ mensagem de ia_indisponivel com o botão", async () => {
    sugerirMock.mockRejectedValueOnce(new Error("rede"));
    irParaDados();
    expect(await screen.findByText(MSG_INDISPONIVEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar sugestão de novo" })).toBeInTheDocument();
  });

  it("US3-AC6: resultado undefined ⇒ mensagem de ia_indisponivel com o botão", async () => {
    sugerirMock.mockResolvedValueOnce(undefined as never);
    irParaDados();
    expect(await screen.findByText(MSG_INDISPONIVEL)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar sugestão de novo" })).toBeInTheDocument();
  });

  it("US3-AC7: ia_pausada ⇒ mensagem sem botão de repetir", async () => {
    sugerirMock.mockResolvedValueOnce(pausada());
    irParaDados();
    expect(await screen.findByText(MSG_PAUSADA)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tentar sugestão de novo" })).toBeNull();
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["ia_indisponivel", () => Promise.resolve(indisponivel())],
    ["ia_pausada", () => Promise.resolve(pausada())],
    ["rejeição", () => Promise.reject(new Error("rede"))],
  ])("FR-027: em falha (%s) o formulário continua editável e 'Salvar' envia", async (_n, resposta) => {
    sugerirMock.mockImplementationOnce(resposta as never);
    criarMock.mockResolvedValue({ ok: true, id: 3 });
    irParaDados(["e1", "e2"]);
    await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent(ESPERANDO));
    fireEvent.change(nome(), { target: { value: "Meia feita à mão" } });
    fireEvent.change(categoria(), { target: { value: "1" } });
    expect(nome()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    const fd = criarMock.mock.calls[0][1];
    expect(fd.get("nome")).toBe("Meia feita à mão");
    expect(fd.getAll("fotos")).toEqual(["e1", "e2"]);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/painel/produtos/3"));
  });

  it("US3-AC8: 'Cancelar' no passo Dados, com sugestão aplicada, não chama criarProduto", async () => {
    sugerirMock.mockResolvedValue(ok());
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(h.push).toHaveBeenCalledWith("/painel/produtos");
    expect(criarMock).not.toHaveBeenCalled();
  });

  it("US3-AC8: a sugestão pronta sozinha nunca cria produto (nada é salvo sem 'Salvar')", async () => {
    sugerirMock.mockResolvedValue(ok());
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(criarMock).not.toHaveBeenCalled();
    expect(h.push).not.toHaveBeenCalled();
  });

  it("US3-AC5: 'Salvar' com a sugestão aplicada envia os valores sugeridos (e o preço digitado) para criarProduto", async () => {
    sugerirMock.mockResolvedValue(ok());
    criarMock.mockResolvedValue({ ok: true, id: 11 });
    irParaDados(["e2", "e1"]);
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    fireEvent.change(preco(), { target: { value: "1290" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    const fd = criarMock.mock.calls[0][1];
    expect(fd.get("nome")).toBe("Meia lisa");
    expect(fd.get("categoriaId")).toBe("1");
    expect(fd.get("descricao")).toBe("Meia de algodão");
    expect(fd.get("preco")).toBe("12,90");
    expect(fd.getAll("fotos")).toEqual(["e2", "e1"]);
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/painel/produtos/11"));
  });

  it("US3-AC5: nome repetido na sugestão ⇒ a recusa aparece como hoje, junto do campo, com link", async () => {
    sugerirMock.mockResolvedValue(ok());
    criarMock.mockResolvedValue({
      ok: false,
      motivo: "nome_repetido",
      mensagem: "Já existe um produto com esse nome: #0042.",
      campo: "nome",
      codigoExistente: 42,
      valores: { nome: "Meia lisa", categoriaId: "1", descricao: "Meia de algodão", preco: "", aPartirDe: false },
    } as never);
    irParaDados();
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    const link = await screen.findByRole("link", { name: "#0042" });
    expect(link).toHaveAttribute("href", "/painel/produtos/42");
    expect(nome()).toHaveAttribute("aria-invalid", "true");
    expect(nome()).toHaveValue("Meia lisa");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("região viva: role=status já existe no passo Fotos, fora de [hidden]; o texto de espera entra no MESMO elemento", () => {
    novoEnvio({ fotos: [enviada(1)], envioIds: ["e1"] });
    render(<CadastroProduto categorias={categorias} />);
    const antes = screen.getByRole("status");
    expect(antes.closest("[hidden]")).toBeNull();
    expect(antes).toBeEmptyDOMElement();
    fireEvent.click(continuar());
    const depois = screen.getByRole("status");
    expect(depois).toBe(antes);
    expect(depois).toHaveTextContent(ESPERANDO);
  });

  it("'Tentar sugestão de novo' leva o foco ao título 'Dados do produto'", async () => {
    sugerirMock.mockResolvedValueOnce(indisponivel());
    irParaDados();
    const botao = await screen.findByRole("button", { name: "Tentar sugestão de novo" });
    botao.focus();
    sugerirMock.mockReturnValueOnce(deferred().promise);
    fireEvent.click(botao);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Dados do produto" }));
  });

  it("sugestão que chega com o passo Fotos aberto é aplicada; os marcadores aparecem ao voltar ao passo Dados", async () => {
    const d = deferred();
    sugerirMock.mockReturnValue(d.promise);
    irParaDados();
    fireEvent.click(screen.getByRole("button", { name: "Voltar às fotos" }));
    d.resolve(ok());
    await waitFor(() => expect(sugerirMock).toHaveBeenCalledTimes(1));
    fireEvent.click(continuar());
    await waitFor(() => expect(nome()).toHaveValue("Meia lisa"));
    expect(categoria()).toHaveValue("1");
    expect(descricao()).toHaveValue("Meia de algodão");
    expect(screen.getAllByText(MARCADOR)).toHaveLength(3);
    expect(nome()).toHaveAccessibleDescription(MARCADOR);
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });
});
