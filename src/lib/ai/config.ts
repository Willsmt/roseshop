// Constantes da sugestão por IA (contracts/ia.md §1, ADR-010). Modelo e esforço são
// provisórios até a medição da SF13 (`npm run test:ia`); o resultado fica registrado no ADR-010.

export type Esforco = "none" | "low";

export const MODELO = "gpt-6-luna";
export const ESFORCO: Esforco = "none";
export const TEMPO_LIMITE_MS = 20_000;
export const MAX_SAIDA = 800;
/** Sugestões por administradora por dia de Brasília (US3-AC7). */
export const LIMITE_POR_PESSOA = 30;
/** Sugestões somadas de todas por dia de Brasília. */
export const LIMITE_TOTAL = 100;
