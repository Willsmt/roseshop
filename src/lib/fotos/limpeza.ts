import "server-only";

import { dbDoContexto } from "@/lib/db/contexto";
import { chavesConhecidas, expirarEnvios } from "@/lib/db/fotos";
import { apagarObjetos, listarObjetos } from "@/lib/r2";

// Limpeza diária (contracts/fotos.md §6, ADR-009 D5). Nenhum log leva chave de objeto.
const LOTE = 1000;
// 1 h além das 24 h do envio: cobre diferença de relógio entre R2 e Postgres (FR-038).
const CARENCIA_MS = 25 * 60 * 60 * 1000;

export type ResultadoLimpeza = { enviosExpirados: number; orfaosApagados: number; falhas: number };

// Lote a lote: um `delete` que falha só soma em `falhas`; a próxima execução tenta de novo.
async function apagarEmLotes(chaves: string[]): Promise<{ apagados: number; falhas: number }> {
  let apagados = 0;
  let falhas = 0;
  for (let i = 0; i < chaves.length; i += LOTE) {
    const lote = chaves.slice(i, i + LOTE);
    try {
      await apagarObjetos(lote);
      apagados += lote.length;
    } catch {
      falhas += lote.length;
      console.warn(JSON.stringify({ evento: "limpeza.lote_nao_apagado", quantidade: lote.length }));
    }
  }
  return { apagados, falhas };
}

export async function executarLimpeza(agora: Date): Promise<ResultadoLimpeza> {
  const db = await dbDoContexto();

  // (a) Envios com 24 h ou mais, sob o LOCK_FOTOS: nenhuma adoção intercala.
  const expirados = await expirarEnvios(db);
  const a = await apagarEmLotes(expirados);

  // (b) Órfãos. As tabelas são lidas DEPOIS de listar: um objeto com mais de 25 h não pode mais
  // ser adotado, então se não está em nenhuma delas agora, ninguém passa a referenciá-lo.
  const limite = agora.getTime() - CARENCIA_MS;
  const candidatos: string[] = [];
  for await (const objeto of listarObjetos("fotos/")) {
    if (objeto.uploaded.getTime() < limite) candidatos.push(objeto.chave);
  }
  let b = { apagados: 0, falhas: 0 };
  if (candidatos.length > 0) {
    const conhecidas = await chavesConhecidas(db);
    // As chaves de (a) ficam de fora: já foram tentadas agora; se falharam, a próxima execução
    // as acha como órfãs. Assim nenhuma conta em `falhas` e em `orfaosApagados` ao mesmo tempo.
    const tentadas = new Set(expirados);
    b = await apagarEmLotes(candidatos.filter((c) => !conhecidas.has(c) && !tentadas.has(c)));
  }

  const resultado = {
    enviosExpirados: expirados.length,
    orfaosApagados: b.apagados,
    falhas: a.falhas + b.falhas,
  };
  console.log(JSON.stringify({ evento: "limpeza", ...resultado }));
  return resultado;
}
