import { describe, expect, it } from "vitest";

import { safeCallbackPath } from "./callback-path";

describe("safeCallbackPath (FR-009, US1-4)", () => {
  it.each(["/painel", "/painel/produtos", "/painel/produtos/123?x=1"])(
    "aceita o caminho interno %s",
    (path) => {
      expect(safeCallbackPath(path)).toBe(path);
    },
  );

  it.each([
    ["//evil.com"],
    ["https://evil.com"],
    ["/\\evil"],
    ["/"],
    ["/painelx"],
    ["javascript:alert(1)"],
    [""],
  ])("cai em /painel para %s (retorno externo, FR-009)", (raw) => {
    expect(safeCallbackPath(raw)).toBe("/painel");
  });

  it.each([[undefined], [null], [42], [{}], [["/painel"]]])(
    "cai em /painel para valor não-string %o",
    (raw) => {
      expect(safeCallbackPath(raw)).toBe("/painel");
    },
  );
});
