import { describe, expect, it } from "vitest";

import { formatarCodigo, interpretarCodigoBusca } from "./codigo";

// T013 / contrato §4 (código = id com lpad 4; busca ^#?\d{1,9}$).

describe("formatarCodigo", () => {
  it.each([
    [1, "#0001"],
    [42, "#0042"],
    [9999, "#9999"],
    [12345, "#12345"], // acima de 9999 não trunca
    [123456789, "#123456789"],
  ])("%d ⇒ %s", (id, esperado) => {
    expect(formatarCodigo(id)).toBe(esperado);
  });
});

describe("interpretarCodigoBusca", () => {
  it.each([
    ["42", 42],
    ["0042", 42],
    ["#0042", 42],
    ["#42", 42],
    ["999999999", 999999999], // 9 dígitos
  ])("%j ⇒ %d", (texto, id) => {
    expect(interpretarCodigoBusca(texto)).toBe(id);
  });

  it.each(["meia", "meia 42", "#", "", "4.2", "-42", "#-42", "12a", "##42", "1234567890"])(
    "%j não é código ⇒ null",
    (texto) => {
      expect(interpretarCodigoBusca(texto)).toBeNull();
    },
  );

  it.each(["0", "#0", "0000"])(
    "%j casa o formato, mas 0 não é id válido ⇒ null (ids começam em 1)",
    (texto) => {
      expect(interpretarCodigoBusca(texto)).toBeNull();
    },
  );
});
