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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { criarProduto } from "@/lib/produtos/actions";
import { CONTINUAR_COM_NAO_ENVIADA, mensagemFoto } from "@/lib/fotos/mensagens";

import { CadastroProduto } from "./cadastro-produto";

const criarMock = vi.mocked(criarProduto);
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
