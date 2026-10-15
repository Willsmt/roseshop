// Registro estruturado de falhas do catálogo (contracts/publico.md §7, research D11). Puro e sem
// dependências: o worker (`cloudflare/publico.ts`) o importa por caminho relativo, e o
// `registro.ts` (server-only) o reexporta para páginas e rotas.
//
// Evento, rota e causa são listas fechadas: nunca a mensagem da exceção, o valor de configuração,
// a chave de objeto, a URL com query, IP, cabeçalho ou e-mail.
export type EventoFalha =
  | "catalogo.banco_indisponivel"
  | "catalogo.erro_inesperado"
  | "catalogo.fotos_falha"
  | "catalogo.whatsapp_invalido"
  | "catalogo.site_url_invalida";

export type RotaFalha =
  | "/"
  | "/p/[codigo]"
  | "/api/catalogo/produtos"
  | "/fotos/[arquivo]"
  | "configuracao";

export type CausaFalha = "banco" | "r2" | "config" | "inesperado";

// Contrato §7, ramo FALLBACK: não há versão anterior, o 500 público vira sempre "503" (o worker).
export type ResultadoFalha = "503";

export type Falha = {
  evento: EventoFalha;
  rota: RotaFalha;
  causa: CausaFalha;
  resultado?: ResultadoFalha;
};

export function registrarFalha({ evento, rota, causa, resultado }: Falha): void {
  console.error(JSON.stringify({ evento, rota, causa, resultado }));
}
