export type LoginNotice = "recusada" | "falhou" | null;

// Só "AccessDenied" vem da nossa recusa (callback signIn). Qualquer outro
// código, inclusive valor adulterado na URL, vira o aviso genérico de falha.
export function loginNoticeFromError(code: unknown): LoginNotice {
  if (code === undefined || code === null || code === "") return null;
  return code === "AccessDenied" ? "recusada" : "falhou";
}
