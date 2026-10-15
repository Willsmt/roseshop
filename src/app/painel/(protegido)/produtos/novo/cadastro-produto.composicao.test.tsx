// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// T089 (SF9), composição: página + useEnvioFotos REAL + ListaFotos REAL + EscolherFoto REAL.
// Mockados só as actions, o pipeline do aparelho, fetch, URL.* e o recorte (react-easy-crop
// não roda em jsdom; o recorte falso só devolve a área ao tocar "Usar esta foto").
// Edge case de expiração (spec 004) + D1 + correção 10 da REVISÃO 2 do contrato interno.

const h = vi.hoisted(() => ({ AREA: { x: 0, y: 0, lado: 800 }, push: vi.fn() }));

vi.mock("@/lib/fotos/actions", () => ({ pedirEnvio: vi.fn(), confirmarEnvio: vi.fn() }));
vi.mock("@/lib/fotos/aparelho/preparar-foto", () => ({ prepararFoto: vi.fn(), abrirImagem: vi.fn() }));
vi.mock("@/lib/produtos/actions", () => ({ criarProduto: vi.fn(), editarProduto: vi.fn() }));
vi.mock("@/lib/produtos/sugestao", () => ({ sugerirProduto: vi.fn() }));
vi.mock("../_fotos/recorte-foto", () => ({
  RecorteFoto: (p: { arquivo: File; onUsar: (a: typeof h.AREA) => void; onCancelar: () => void }) => (
    <div data-testid="recorte">
      <button type="button" onClick={() => p.onUsar(h.AREA)}>
        Usar esta foto
      </button>
      <button type="button" onClick={p.onCancelar}>
        Cancelar
      </button>
    </div>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { confirmarEnvio, pedirEnvio } from "@/lib/fotos/actions";
import { abrirImagem, prepararFoto } from "@/lib/fotos/aparelho/preparar-foto";
import { mensagemFoto } from "@/lib/fotos/mensagens";
import { criarProduto } from "@/lib/produtos/actions";

import { CadastroProduto } from "./cadastro-produto";

const pedirMock = vi.mocked(pedirEnvio);
const confirmarMock = vi.mocked(confirmarEnvio);
const prepararMock = vi.mocked(prepararFoto);
const abrirMock = vi.mocked(abrirImagem);
const criarMock = vi.mocked(criarProduto);
const fetchMock = vi.fn();

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46];
const foto = (nome: string) =>
  new File([new Uint8Array([...JPEG, ...new Array(54).fill(0)])], nome, { type: "image/jpeg" });

let nUrl = 0;

beforeEach(() => {
  nUrl = 0;
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:composicao/${++nUrl}`),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
  vi.stubGlobal("fetch", fetchMock);
  for (const m of [pedirMock, confirmarMock, prepararMock, abrirMock, criarMock, fetchMock, h.push]) m.mockReset();

  let n = 0;
  abrirMock.mockResolvedValue({ width: 1600, height: 1200, close: vi.fn() });
  prepararMock.mockImplementation(async () => ({
    blob: new Blob([new Uint8Array(500)], { type: "image/webp" }),
    formato: "webp" as const,
  }));
  pedirMock.mockImplementation(async () => {
    const envioId = `e${++n}`;
    return { ok: true as const, envioId, url: `https://r2.exemplo/${envioId}`, headers: { "content-type": "image/webp", "if-none-match": "*" } };
  });
  fetchMock.mockResolvedValue({ ok: true, status: 200 } as Response);
  confirmarMock.mockImplementation(async ({ envioId }) => ({ ok: true as const, envioId, arquivo: `${envioId}.webp` }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function enviarFoto(nome: string, total: number) {
  fireEvent.change(screen.getByTestId("entrada-arquivo"), { target: { files: [foto(nome)] } });
  fireEvent.click(await screen.findByRole("button", { name: "Usar esta foto" }));
  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(total));
  await waitFor(() => expect(screen.queryByText("Enviando…")).toBeNull());
}

describe("CadastroProduto + useEnvioFotos real — foto expirada ao salvar", () => {
  it("2 fotos enviadas, Continuar, Salvar ⇒ foto_expirada da 2ª ⇒ volta às Fotos com a 2ª em 'Não enviada' + 'Tentar de novo' e o aviso", async () => {
    render(<CadastroProduto categorias={[{ id: 1, nome: "Meias" }]} />);

    await enviarFoto("a.jpg", 1);
    await enviarFoto("b.jpg", 2);
    const continuar = screen.getByRole("button", { name: "Continuar" });
    expect(continuar).toBeEnabled();
    fireEvent.click(continuar);
    expect(screen.getByRole("heading", { name: "Dados do produto" })).toBeInTheDocument();

    criarMock.mockResolvedValue({
      ok: false,
      motivo: "foto_expirada",
      mensagem: mensagemFoto("foto_expirada"),
      envioIds: ["e2"],
      valores: { nome: "", categoriaId: "", descricao: "", preco: "", aPartirDe: false },
    } as never);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(criarMock).toHaveBeenCalledTimes(1));
    expect(criarMock.mock.calls[0][1].getAll("fotos")).toEqual(["e1", "e2"]);

    // Volta ao passo Fotos, com o foco no heading (correção 10).
    const titulo = await screen.findByRole("heading", { name: "Fotos" });
    await waitFor(() => expect(document.activeElement).toBe(titulo));
    expect(screen.queryByRole("heading", { name: "Dados do produto" })).toBeNull();

    // O aviso do passo Fotos (o do formulário fica no passo escondido).
    expect(screen.getByRole("alert")).toHaveTextContent("Uma das fotos ficou muito tempo sem ser salva. Envie essa foto de novo.");

    const primeira = screen.getByRole("listitem", { name: "Foto 1" });
    const segunda = screen.getByRole("listitem", { name: "Foto 2" });
    expect(within(primeira).queryByText("Não enviada")).toBeNull();
    expect(within(segunda).getByText("Não enviada")).toBeInTheDocument();
    expect(within(segunda).getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();

    // D1: com a 2ª não enviada, "Continuar" fica indisponível.
    expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
    expect(h.push).not.toHaveBeenCalled();
  });
});
