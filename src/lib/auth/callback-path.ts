const DEFAULT_PATH = "/painel";

// Só caminhos relativos dentro do painel: barra o retorno para sites externos
// ("//host", "https://", "/\host") e para fora de /painel.
const PAINEL_PATH = /^\/painel(?:[/?#]|$)/;

export function safeCallbackPath(raw: unknown): `/painel${string}` {
  if (typeof raw !== "string") return DEFAULT_PATH;
  if (!PAINEL_PATH.test(raw) || raw.includes("\\")) return DEFAULT_PATH;
  return raw as `/painel${string}`;
}
