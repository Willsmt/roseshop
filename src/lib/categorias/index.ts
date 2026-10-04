import "server-only";

import { listar, obterPorId } from "@/lib/db/categorias";
import { dbDoContexto } from "@/lib/db/contexto";

import { CategoriaInvalidaError } from "./erros";
import { idCategoria } from "./nome";

// Barrel SOMENTE LEITURA (contrato §1, FR-014/FR-015). Única porta para a 003, a IA e o
// catálogo: não expõe `versao`, escrita, schema nem o módulo do painel. A allowlist de
// exports é verificada em src/test/conformance/categorias-acesso.test.ts.

export type Categoria = { id: number; nome: string };

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
