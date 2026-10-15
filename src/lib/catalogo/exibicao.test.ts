import { describe, expect, it } from "vitest";

import {
  acrescentarSemRepetir,
  altFoto,
  codigoCanonico,
  hrefProduto,
  linkWhatsapp,
  mensagemWhatsapp,
  mostrarWhatsapp,
  precoPublico,
} from "./exibicao";

// T026 / contrato §6 (exibicao.ts); spec FR-003, FR-012, FR-017, FR-018.

describe("precoPublico", () => {
  it.each([
    [null, false, "Consulte o valor"],
    [null, true, "Consulte o valor"],
    [1290, false, "R$ 12,90"],
    [1290, true, "a partir de R$ 12,90"],
    [123456, false, "R$ 1.234,56"],
  ] as const)("(%s, %s) = %s", (centavos, aPartirDe, esperado) => {
    expect(precoPublico(centavos, aPartirDe)).toBe(esperado);
  });
});

describe("codigoCanonico e hrefProduto", () => {
  it("usa o id com zeros à esquerda, sem #", () => {
    expect(codigoCanonico(42)).toBe("0042");
    expect(codigoCanonico(10000)).toBe("10000");
  });

  it("monta o caminho do produto", () => {
    expect(hrefProduto(42)).toBe("/p/0042");
    expect(hrefProduto(10000)).toBe("/p/10000");
  });
});

describe("altFoto", () => {
  it("descreve a posição da foto", () => {
    expect(altFoto("Meia", 1, 3)).toBe("Meia — foto 1 de 3");
  });
});

describe("mensagemWhatsapp", () => {
  it("inclui o link do produto quando há siteUrl", () => {
    expect(mensagemWhatsapp("Meia soquete listrada", 42, "https://x.dev")).toBe(
      "Olá! Tenho interesse no produto Meia soquete listrada (#0042): https://x.dev/p/0042",
    );
  });

  it("sai sem o link quando siteUrl é null", () => {
    expect(mensagemWhatsapp("Meia soquete listrada", 42, null)).toBe(
      "Olá! Tenho interesse no produto Meia soquete listrada (#0042)",
    );
  });
});

describe("linkWhatsapp", () => {
  it("usa só os dígitos do número", () => {
    expect(linkWhatsapp("+5511999999999", "oi")).toBe(
      "https://wa.me/5511999999999?text=oi",
    );
  });

  it.each([
    "Meia & Cia",
    "Kit #3?",
    "Blusa de lã açaí",
    "Laço 🎀 rosa",
    "a=b&c=d%20e",
  ])("devolve a mensagem exata para %s", (nome) => {
    const msg = mensagemWhatsapp(nome, 7, "https://x.dev");
    const url = new URL(linkWhatsapp("+5511999999999", msg));
    expect(url.origin + url.pathname).toBe("https://wa.me/5511999999999");
    expect(url.searchParams.get("text")).toBe(msg);
    expect(decodeURIComponent(url.search.slice("?text=".length))).toBe(msg);
  });
});

describe("mostrarWhatsapp (FR-018)", () => {
  it.each([
    [false, true, true],
    [true, true, false],
    [false, false, false],
    [true, false, false],
  ])("esgotado=%s, temNumero=%s ⇒ %s", (esgotado, temNumero, esperado) => {
    expect(mostrarWhatsapp(esgotado, temNumero)).toBe(esperado);
  });
});

describe("acrescentarSemRepetir", () => {
  it("acrescenta os novos na ordem e descarta os que já estão", () => {
    expect(
      acrescentarSemRepetir([{ href: "/p/0001" }, { href: "/p/0002" }], [{ href: "/p/0002" }, { href: "/p/0003" }]),
    ).toEqual([{ href: "/p/0001" }, { href: "/p/0002" }, { href: "/p/0003" }]);
  });
});
