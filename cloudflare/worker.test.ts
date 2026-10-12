import { beforeEach, describe, expect, it, vi } from "vitest";

// T111 (parte do worker): scheduled chama o handler em processo (POST + Bearer) e LANÇA se ≠ 200.
// contracts/fotos.md §6, TL-16.
const m = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("open-next-worker", () => ({ default: { fetch: m.fetch } }));

import worker from "./worker";

const SEGREDO = "segredo-de-teste";
const env = { CRON_SECRET: SEGREDO } as unknown as CloudflareEnv;
const ctx = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
} as unknown as ExecutionContext;
const evento = {
  cron: "0 6 * * *",
  scheduledTime: 0,
  type: "scheduled",
} as unknown as ScheduledController;

const agendar = () => worker.scheduled(evento, env, ctx);

beforeEach(() => {
  m.fetch.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.mocked(ctx.waitUntil).mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("cloudflare/worker.ts", () => {
  it("reexporta o fetch do handler do OpenNext (o mesmo)", () => {
    expect(worker.fetch).toBe(m.fetch);
  });

  it("scheduled chama o handler uma vez, com URL, método e header exatos, e o MESMO env e ctx", async () => {
    await agendar();
    expect(m.fetch).toHaveBeenCalledTimes(1);
    const [req, e, c] = m.fetch.mock.calls[0] as [Request, unknown, unknown];
    expect(req).toBeInstanceOf(Request);
    expect(req.url).toBe("https://interno.invalid/api/interno/limpeza");
    expect(req.method).toBe("POST");
    expect(req.headers.get("authorization")).toBe(`Bearer ${SEGREDO}`);
    expect(e).toBe(env);
    expect(c).toBe(ctx);
  });

  it("resolve com status 200 e registra { evento, status }", async () => {
    await expect(agendar()).resolves.toBeUndefined();
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({ evento: "limpeza", status: 200 }),
    );
  });

  it.each([404, 500, 503])(
    "rejeita quando o handler responde %i",
    async (status) => {
      m.fetch.mockResolvedValue(new Response(null, { status }));
      await expect(agendar()).rejects.toThrow();
    },
  );

  it("não usa ctx.waitUntil (aguarda a resposta)", async () => {
    await agendar();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
});
