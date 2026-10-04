import { z } from "zod";

// Validação de domínio do nome e dos identificadores de categoria (FR-007, FR-008).
// Sem dependência do banco: é usado pelo barrel, pelo painel e pelas actions. A `chave`
// não é calculada aqui; é coluna gerada pelo Postgres (`categoria_chave`).

export type MotivoNome = "nome_vazio" | "nome_tamanho" | "nome_caracteres" | "nome_sem_letra";

export type NomeValidado = { ok: true; nome: string } | { ok: false; motivo: MotivoNome };

const TAMANHO_MIN = 2;
const TAMANHO_MAX = 40;
// Teto do `integer` do Postgres: acima disso a consulta falharia com erro do banco
// (22003) em vez de simplesmente não achar a categoria.
const INTEIRO_MAX = 2_147_483_647;

export function normalizarNome(nome: string): string {
  return nome.normalize("NFC").trim().replace(/\s+/g, " ");
}

// Conta code points, como o `char_length` do CHECK no banco (letras astrais valem 1).
const tamanho = (nome: string) => [...nome].length;

// A ordem das checagens é a precedência do motivo devolvido.
const nomeCategoria = z
  .string({ error: "nome_vazio" })
  .transform(normalizarNome)
  .pipe(
    z
      .string()
      .min(1, { error: "nome_vazio", abort: true })
      .regex(/^[\p{L}\p{N} -]+$/u, { error: "nome_caracteres", abort: true })
      // Só hífen/espaço geraria chave vazia e colidiria no UNIQUE (decisão 1 da SF3).
      .regex(/[\p{L}\p{N}]/u, { error: "nome_sem_letra", abort: true })
      .refine((n) => tamanho(n) >= TAMANHO_MIN && tamanho(n) <= TAMANHO_MAX, {
        error: "nome_tamanho",
      }),
  );

const MOTIVOS_NOME: readonly MotivoNome[] = [
  "nome_vazio",
  "nome_caracteres",
  "nome_sem_letra",
  "nome_tamanho",
];

export function validarNome(entrada: unknown): NomeValidado {
  const r = nomeCategoria.safeParse(entrada);
  if (r.success) return { ok: true, nome: r.data };
  const mensagens = new Set(r.error.issues.map((i) => i.message));
  return { ok: false, motivo: MOTIVOS_NOME.find((m) => mensagens.has(m)) ?? "nome_vazio" };
}

// Inteiro positivo que cabe no `integer` do Postgres, como number ou como string decimal
// canônica ("3"). O regex barra o que `Number()` aceitaria por engano (" 3", "1e2", "03", "").
const inteiroPositivo = z.number().int().positive().max(INTEIRO_MAX);
const inteiroDoBanco = z.union([
  inteiroPositivo,
  z
    .string()
    .regex(/^[1-9]\d{0,9}$/)
    .transform(Number)
    .pipe(inteiroPositivo),
]);

/** Id de categoria (decisão 2 da SF3): schema único do barrel, do painel e das actions. */
export const idCategoria = inteiroDoBanco;

/** Versão para a concorrência otimista (FR-019); mesmas regras do id. */
export const versaoCategoria = inteiroDoBanco;
