import "server-only";

import { z } from "zod";

import { listar, obterPorId } from "@/lib/db/categorias";
import { dbDoContexto } from "@/lib/db/contexto";

import { CategoriaInvalidaError } from "./erros";

// Barrel SOMENTE LEITURA (contrato §1, FR-014/FR-015). Única porta para a 003, a IA e o
// catálogo: não expõe `versao`, escrita, schema nem o módulo do painel. A allowlist de
// exports é verificada em src/test/conformance/categorias-acesso.test.ts.

export type Categoria = { id: number; nome: string };

// Teto do `integer` do Postgres: acima disso a consulta falharia com erro do banco
// (22003) em vez de simplesmente não achar a categoria.
const idCategoria = z.number().int().positive().max(2_147_483_647);

export async function listarCategorias(): Promise<Categoria[]> {
  const lista = await listar(await dbDoContexto());
  return lista.map(({ id, nome }) => ({ id, nome }));
}

export async function obterCategoria(id: number): Promise<Categoria | null> {
  const valido = idCategoria.safeParse(id);
  if (!valido.success) return null;
  const linha = await obterPorId(await dbDoContexto(), valido.data);
  return linha ? { id: linha.id, nome: linha.nome } : null;
}

// Nunca cria: id fora da lista atual (inválido, inexistente ou removido) é rejeitado.
export async function exigirCategoriaValida(id: unknown): Promise<number> {
  const valido = idCategoria.safeParse(id);
  if (!valido.success) throw new CategoriaInvalidaError();
  const linha = await obterPorId(await dbDoContexto(), valido.data);
  if (!linha) throw new CategoriaInvalidaError();
  return linha.id;
}

export { CategoriaInvalidaError };
