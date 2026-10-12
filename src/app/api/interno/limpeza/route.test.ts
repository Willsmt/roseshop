import fs from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

// T111 (rota): POST /api/interno/limpeza protegida por CRON_SECRET, 404 uniforme (contracts/fotos.md §6, TL-16).
const m = vi.hoisted(() => ({
  getCloudflareContext: vi.fn(),
  executarLimpeza: vi.fn(),
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: m.getCloudflareContext,
}));
vi.mock("@/lib/fotos/limpeza", () => ({ executarLimpeza: m.executarLimpeza }));

import * as rota from "./route";

const SEGREDO = "segredo-correto-1234567890";
const URL_ROTA = "https://exemplo.test/api/interno/limpeza";
const CONTAGENS = { enviosExpirados: 3, orfaosApagados: 2, falhas: 1 };

function pedido(metodo: string, authorization?: string): Request {
  return new Request(URL_ROTA, {
    method: metodo,
    headers: authorization === undefined ? {} : { authorization },
  });
}

async function chamar(metodo: string, authorization?: string) {
  const handler = (
    rota as unknown as Record<string, (r: Request) => Promise<Response>>
  )[metodo];
  return handler(pedido(metodo, authorization));
}

async function resumo(res: Response) {
  return {
    status: res.status,
    corpo: await res.text(),
    headers: [...res.headers.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

let logs: ReturnType<typeof vi.spyOn>[];

function tudoLogado(): string {
  return logs.map((s) => JSON.stringify(s.mock.calls)).join("\n");
}

beforeEach(() => {
  m.getCloudflareContext
    .mockReset()
    .mockResolvedValue({ env: { CRON_SECRET: SEGREDO } });
  m.executarLimpeza.mockReset().mockResolvedValue(CONTAGENS);
  logs = (["log", "warn", "error", "info"] as const).map((n) =>
    vi.spyOn(console, n).mockImplementation(() => {}),
  );
});

describe("POST /api/interno/limpeza", () => {
  it("sucesso: 200, JSON com as contagens, no-store e executarLimpeza chamada uma vez com um Date", async () => {
    const res = await chamar("POST", `Bearer ${SEGREDO}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CONTAGENS);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(m.executarLimpeza).toHaveBeenCalledTimes(1);
    expect(m.executarLimpeza.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it("lê o CRON_SECRET de getCloudflareContext({ async: true })", async () => {
    await chamar("POST", `Bearer ${SEGREDO}`);
    expect(m.getCloudflareContext).toHaveBeenCalledWith({ async: true });
  });

  const negados: [string, () => Promise<Response>][] = [
    ["header ausente", () => chamar("POST")],
    ["sem prefixo Bearer", () => chamar("POST", SEGREDO)],
    ["prefixo em minúsculas", () => chamar("POST", `bearer ${SEGREDO}`)],
    ["segredo errado", () => chamar("POST", "Bearer errado")],
    ["segredo com sufixo extra", () => chamar("POST", `Bearer ${SEGREDO}x`)],
    ["segredo com prefixo extra", () => chamar("POST", `Bearer x${SEGREDO}`)],
    ["Bearer vazio", () => chamar("POST", "Bearer ")],
    [
      "CRON_SECRET ausente",
      async () => {
        m.getCloudflareContext.mockResolvedValue({ env: {} });
        return chamar("POST", `Bearer ${SEGREDO}`);
      },
    ],
    [
      "CRON_SECRET vazio (e header Bearer vazio)",
      async () => {
        m.getCloudflareContext.mockResolvedValue({ env: { CRON_SECRET: "" } });
        return chamar("POST", "Bearer ");
      },
    ],
    ...["GET", "HEAD", "PUT", "PATCH", "DELETE", "OPTIONS"].map(
      (met): [string, () => Promise<Response>] => [
        `método ${met} (mesmo com segredo correto)`,
        () => chamar(met, `Bearer ${SEGREDO}`),
      ],
    ),
  ];

  it.each(negados)(
    "404 sem corpo e sem executar a limpeza: %s",
    async (_nome, fazer) => {
      const res = await fazer();
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
      expect(m.executarLimpeza).not.toHaveBeenCalled();
    },
  );

  it("status, corpo e headers são iguais em todos os casos negados", async () => {
    const resumos = [];
    for (const [, fazer] of negados) {
      const r = await resumo(await fazer());
      // HEAD/OPTIONS podem não ter corpo por natureza; aqui o corpo é vazio em todos.
      resumos.push(r);
    }
    for (const r of resumos) expect(r).toEqual(resumos[0]);
  });

  it("exporta POST e os demais métodos (para responder 404 em vez de 405/204)", () => {
    for (const met of [
      "POST",
      "GET",
      "HEAD",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
    ]) {
      expect(typeof (rota as Record<string, unknown>)[met], met).toBe(
        "function",
      );
    }
  });

  it("executarLimpeza lança: 500 sem corpo e nada logado contém a mensagem do erro", async () => {
    m.executarLimpeza.mockRejectedValue(
      new Error("detalhe-secreto-fotos/abc.webp"),
    );
    const res = await chamar("POST", `Bearer ${SEGREDO}`);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
    expect(tudoLogado()).not.toContain("detalhe-secreto");
  });

  it("getCloudflareContext lança: 500 sem corpo, limpeza não chamada e nada logado com a mensagem", async () => {
    m.getCloudflareContext.mockRejectedValue(
      new Error("falha-de-contexto-secreta"),
    );
    const res = await chamar("POST", `Bearer ${SEGREDO}`);
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
    expect(m.executarLimpeza).not.toHaveBeenCalled();
    expect(tudoLogado()).not.toContain("falha-de-contexto-secreta");
  });

  it("não loga o segredo", async () => {
    await chamar("POST", `Bearer ${SEGREDO}`);
    await chamar("POST", "Bearer errado");
    expect(tudoLogado()).not.toContain(SEGREDO);
  });

  it("código da rota: sem timingSafeEqual, sem === sobre segredo; usa SHA-256 via crypto.subtle", () => {
    const fonte = fs.readFileSync(
      "src/app/api/interno/limpeza/route.ts",
      "utf8",
    );
    expect(fonte).not.toContain("timingSafeEqual");
    expect(fonte).toContain("crypto.subtle");
    expect(fonte).toMatch(/SHA-256/);
    // Nenhuma comparação de string com === / !== envolvendo o segredo ou o header.
    const linhasComparacao = fonte
      .split("\n")
      .filter(
        (l) =>
          /(===|!==|==|!=)/.test(l) &&
          /(secret|segredo|authorization|bearer|header|esperado|recebido|cabecalho|cron_secret)/i.test(
            l,
          ),
      );
    expect(linhasComparacao).toEqual([]);
    expect(fonte).toContain("mesmosBytes(await sha256(");
  });
});
