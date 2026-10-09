import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn() }));

import { getCloudflareContext } from "@opennextjs/cloudflare";

import {
  apagarObjetos,
  lerObjeto,
  listarObjetos,
  servirObjeto,
} from "./bucket";

// T032 (extra): acesso ao binding PRODUCT_IMAGES. Bucket falso, sem rede.

const bucket = {
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
};

beforeEach(() => {
  bucket.get.mockReset();
  bucket.delete.mockReset().mockResolvedValue(undefined);
  bucket.list.mockReset();
  vi.mocked(getCloudflareContext).mockReset();
  vi.mocked(getCloudflareContext).mockResolvedValue({
    env: { PRODUCT_IMAGES: bucket },
  } as never);
});

describe("lerObjeto", () => {
  it("devolve null quando o objeto não existe, chamando get com a chave exata", async () => {
    bucket.get.mockResolvedValue(null);
    expect(await lerObjeto("fotos/a.webp")).toBeNull();
    expect(bucket.get).toHaveBeenCalledWith("fotos/a.webp");
  });

  it("expõe o tamanho sem ler o corpo", async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([1]).buffer);
    bucket.get.mockResolvedValue({ size: 123, arrayBuffer });
    const obj = await lerObjeto("fotos/a.webp");
    expect(obj?.tamanho).toBe(123);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("bytes() devolve um Uint8Array com o conteúdo", async () => {
    const conteudo = new Uint8Array([1, 2, 3, 250]);
    bucket.get.mockResolvedValue({
      size: 4,
      arrayBuffer: async () => conteudo.buffer.slice(0),
    });
    const obj = await lerObjeto("fotos/a.jpg");
    const bytes = await obj!.bytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([1, 2, 3, 250]);
  });
});

describe("apagarObjetos", () => {
  it("não chama delete com lista vazia", async () => {
    await apagarObjetos([]);
    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it("apaga em lotes de até 1000, na ordem (2500 => 1000, 1000, 500)", async () => {
    const chaves = Array.from({ length: 2500 }, (_, i) => `fotos/k${i}`);
    await apagarObjetos(chaves);
    expect(bucket.delete).toHaveBeenCalledTimes(3);
    const lotes = bucket.delete.mock.calls.map((c) => c[0] as string[]);
    expect(lotes.map((l) => l.length)).toEqual([1000, 1000, 500]);
    expect(lotes.flat()).toEqual(chaves);
  });

  it("uma única chamada para até 1000 chaves", async () => {
    const chaves = Array.from({ length: 1000 }, (_, i) => `fotos/k${i}`);
    await apagarObjetos(chaves);
    expect(bucket.delete).toHaveBeenCalledTimes(1);
  });

  it("chaves inexistentes não geram erro", async () => {
    await expect(
      apagarObjetos(["fotos/nao-existe.webp"]),
    ).resolves.toBeUndefined();
  });
});

describe("listarObjetos", () => {
  it("pagina pelo cursor enquanto truncated for true e mapeia key/uploaded", async () => {
    const d1 = new Date("2026-01-01T00:00:00Z");
    const d2 = new Date("2026-01-02T00:00:00Z");
    const d3 = new Date("2026-01-03T00:00:00Z");
    bucket.list
      .mockResolvedValueOnce({
        objects: [
          { key: "fotos/a.webp", uploaded: d1 },
          { key: "fotos/b.webp", uploaded: d2 },
        ],
        truncated: true,
        cursor: "c1",
      })
      .mockResolvedValueOnce({
        objects: [{ key: "fotos/c.jpg", uploaded: d3 }],
        truncated: false,
      });

    const itens: { chave: string; uploaded: Date }[] = [];
    for await (const item of listarObjetos("fotos/")) itens.push(item);

    expect(itens).toEqual([
      { chave: "fotos/a.webp", uploaded: d1 },
      { chave: "fotos/b.webp", uploaded: d2 },
      { chave: "fotos/c.jpg", uploaded: d3 },
    ]);
    expect(bucket.list).toHaveBeenCalledTimes(2);
    expect(bucket.list).toHaveBeenNthCalledWith(1, { prefix: "fotos/" });
    expect(bucket.list).toHaveBeenNthCalledWith(2, {
      prefix: "fotos/",
      cursor: "c1",
    });
  });
});

// T064 (SF6): leitura para exibição, com If-None-Match repassado ao R2 (onlyIf).
describe("servirObjeto", () => {
  it("sem if-none-match chama get só com a chave (sem onlyIf)", async () => {
    bucket.get.mockResolvedValue(null);
    await servirObjeto("fotos/a.webp", null);
    expect(bucket.get).toHaveBeenCalledTimes(1);
    const args = bucket.get.mock.calls[0];
    expect(args[0]).toBe("fotos/a.webp");
    expect(args[1]?.onlyIf).toBeUndefined();
  });

  it("com if-none-match chama get com onlyIf carregando o valor cru", async () => {
    bucket.get.mockResolvedValue(null);
    await servirObjeto("fotos/a.webp", 'W/"abc"');
    const args = bucket.get.mock.calls[0];
    expect(args[0]).toBe("fotos/a.webp");
    const onlyIf = args[1]?.onlyIf;
    expect(onlyIf).toBeDefined();
    const valor =
      onlyIf instanceof Headers
        ? onlyIf.get("if-none-match")
        : onlyIf.etagDoesNotMatch;
    expect(valor).toBe('W/"abc"');
  });

  it("get null => null", async () => {
    bucket.get.mockResolvedValue(null);
    expect(await servirObjeto("fotos/a.webp", null)).toBeNull();
  });

  it("objeto sem body (condição falhou) => corpo null com etag e tamanho", async () => {
    bucket.get.mockResolvedValue({ httpEtag: '"e1"', size: 77 });
    expect(await servirObjeto("fotos/a.webp", '"e1"')).toEqual({
      etag: '"e1"',
      tamanho: 77,
      corpo: null,
    });
  });

  it("com body => corpo é o body e etag é o httpEtag", async () => {
    const body = new Response("abc").body;
    bucket.get.mockResolvedValue({ httpEtag: '"e2"', size: 3, body });
    const r = await servirObjeto("fotos/a.webp", null);
    expect(r?.etag).toBe('"e2"');
    expect(r?.tamanho).toBe(3);
    expect(r?.corpo).toBe(body);
  });
});
