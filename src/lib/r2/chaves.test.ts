import { describe, expect, it } from "vitest";

import { ARQUIVO_VALIDO, arquivoDaChave, chaveDoArquivo, chaveDoEnvio } from "./chaves";

// T032 (contracts/fotos.md §5): chaves das fotos no R2 e validação do nome do arquivo.

const V4 = "3f2b8c1e-5a4d-4e9b-8c7a-1b2c3d4e5f60";

describe("ARQUIVO_VALIDO", () => {
  it("aceita uuid v4 minúsculo com .webp e .jpg", () => {
    expect(ARQUIVO_VALIDO.test(`${V4}.webp`)).toBe(true);
    expect(ARQUIVO_VALIDO.test(`${V4}.jpg`)).toBe(true);
  });

  it.each(["8", "9", "a", "b"])("aceita variante começando em %s", (v) => {
    expect(ARQUIVO_VALIDO.test(`3f2b8c1e-5a4d-4e9b-${v}c7a-1b2c3d4e5f60.webp`)).toBe(true);
  });

  it("recusa uuid v1 (versão diferente de 4)", () => {
    expect(ARQUIVO_VALIDO.test("3f2b8c1e-5a4d-1e9b-8c7a-1b2c3d4e5f60.webp")).toBe(false);
  });

  it.each(["0", "7", "c", "f"])("recusa variante começando em %s", (v) => {
    expect(ARQUIVO_VALIDO.test(`3f2b8c1e-5a4d-4e9b-${v}c7a-1b2c3d4e5f60.webp`)).toBe(false);
  });

  it.each([".png", ".jpeg", ".JPG", ".WEBP", ""])("recusa extensão %j", (ext) => {
    expect(ARQUIVO_VALIDO.test(`${V4}${ext}`)).toBe(false);
  });

  it("recusa uuid com maiúsculas", () => {
    expect(ARQUIVO_VALIDO.test(`${V4.toUpperCase()}.webp`)).toBe(false);
    expect(ARQUIVO_VALIDO.test(`3F2b8c1e-5a4d-4e9b-8c7a-1b2c3d4e5f60.webp`)).toBe(false);
  });

  it.each([
    "..",
    "../x.webp",
    `../${V4}.webp`,
    "a/b",
    `fotos/${V4}.webp`,
    `/${V4}.webp`,
    `${V4}.webp.png`,
    `${V4}.webp\n`,
    `\n${V4}.webp`,
    `${V4}.webp `,
    "",
  ])("recusa %j", (valor) => {
    expect(ARQUIVO_VALIDO.test(valor)).toBe(false);
  });
});

describe("chaveDoEnvio", () => {
  it("monta fotos/<id>.webp para webp", () => {
    expect(chaveDoEnvio(V4, "webp")).toBe(`fotos/${V4}.webp`);
  });

  it("monta fotos/<id>.jpg para jpeg", () => {
    expect(chaveDoEnvio(V4, "jpeg")).toBe(`fotos/${V4}.jpg`);
  });

  it.each([
    ["uuid v1", "3f2b8c1e-5a4d-1e9b-8c7a-1b2c3d4e5f60"],
    ["maiúsculas", V4.toUpperCase()],
    ["traversal", "../x"],
    ["vazio", ""],
  ])("lança se o id for inválido (%s)", (_nome, id) => {
    expect(() => chaveDoEnvio(id, "webp")).toThrow();
    expect(() => chaveDoEnvio(id, "jpeg")).toThrow();
  });
});

describe("chaveDoArquivo", () => {
  it("devolve fotos/<arquivo> para arquivo válido", () => {
    expect(chaveDoArquivo(`${V4}.webp`)).toBe(`fotos/${V4}.webp`);
    expect(chaveDoArquivo(`${V4}.jpg`)).toBe(`fotos/${V4}.jpg`);
  });

  it.each(["..", "a/b", `fotos/${V4}.webp`, `${V4}.png`, `${V4}.webp\n`, ""])(
    "devolve null para %j",
    (arquivo) => {
      expect(chaveDoArquivo(arquivo)).toBeNull();
    },
  );
});

describe("arquivoDaChave", () => {
  it("devolve o nome sem o prefixo fotos/", () => {
    expect(arquivoDaChave(`fotos/${V4}.webp`)).toBe(`${V4}.webp`);
    expect(arquivoDaChave(`fotos/${V4}.jpg`)).toBe(`${V4}.jpg`);
  });

  it.each([
    ["sem prefixo", `${V4}.webp`],
    ["outro prefixo", `outras/${V4}.webp`],
    ["prefixo duplicado", `fotos/fotos/${V4}.webp`],
    ["arquivo inválido", "fotos/x.webp"],
    ["extensão inválida", `fotos/${V4}.png`],
    ["traversal", `fotos/../${V4}.webp`],
    ["quebra de linha", `fotos/${V4}.webp\n`],
    ["só o prefixo", "fotos/"],
    ["vazio", ""],
  ])("devolve null para %s", (_nome, chave) => {
    expect(arquivoDaChave(chave)).toBeNull();
  });
});

describe("inversas", () => {
  const ids = [V4, crypto.randomUUID(), crypto.randomUUID()];
  const arquivos = ids.flatMap((id) => [`${id}.webp`, `${id}.jpg`]);

  it.each(arquivos)("arquivoDaChave(chaveDoArquivo(a)) === a para %s", (a) => {
    expect(arquivoDaChave(chaveDoArquivo(a)!)).toBe(a);
  });

  it.each(arquivos)("chaveDoArquivo(arquivoDaChave(c)) === c para fotos/%s", (a) => {
    const c = `fotos/${a}`;
    expect(chaveDoArquivo(arquivoDaChave(c)!)).toBe(c);
  });

  it.each(ids)("arquivoDaChave(chaveDoEnvio(id, f)) casa ARQUIVO_VALIDO (%s)", (id) => {
    for (const f of ["webp", "jpeg"] as const) {
      const arquivo = arquivoDaChave(chaveDoEnvio(id, f));
      expect(arquivo).not.toBeNull();
      expect(ARQUIVO_VALIDO.test(arquivo!)).toBe(true);
    }
  });
});
