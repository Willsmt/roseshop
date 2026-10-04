import { describe, expect, it } from "vitest";

import { loginNoticeFromError } from "./error-message";

describe("loginNoticeFromError (US1-5)", () => {
  it.each([[undefined], [null], [""]])("sem erro (%o) não mostra aviso", (code) => {
    expect(loginNoticeFromError(code)).toBeNull();
  });

  it("AccessDenied vira recusada", () => {
    expect(loginNoticeFromError("AccessDenied")).toBe("recusada");
  });

  it.each(["OAuthCallbackError", "Configuration", "Verification", "x"])(
    "qualquer outro código de texto (%s) vira falhou (US1-5)",
    (code) => {
      expect(loginNoticeFromError(code)).toBe("falhou");
    },
  );

  it.each([[42], [["AccessDenied"]], [{ code: "AccessDenied" }]])(
    "valor que não é texto (%o) vira falhou (US1-5)",
    (code) => {
      expect(loginNoticeFromError(code)).toBe("falhou");
    },
  );
});
