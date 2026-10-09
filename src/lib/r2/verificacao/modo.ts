// Modo registro (ADR-009 D3, TL-17): só com o valor exato; qualquer outro recusa.
export type ModoVerificacao = "recusar" | "registro";

export function modoVerificacao(): ModoVerificacao {
  return process.env.FOTOS_VERIFICACAO === "registro" ? "registro" : "recusar";
}
