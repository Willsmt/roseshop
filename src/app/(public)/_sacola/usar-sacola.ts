import { useSyncExternalStore } from "react";

import { CHAVE, assinarSacola, lerSacola, type Leitura } from "@/lib/sacola/armazenamento";
import type { Sacola } from "@/lib/sacola/sacola";

// Estado da sacola nas ilhas (research D9/D13). No servidor e na hidratação é `null`; depois,
// `lerSacola` decide. Armazenamento indisponível continua `null` (FR-002a). Só lê: a gravação é
// sempre por `alterarSacola`, numa ação da própria aba (FR-008a).

export const armazenamento = () => window.localStorage;

// O useSyncExternalStore exige o mesmo objeto enquanto nada mudou: a leitura só é refeita quando o
// texto gravado muda. `undefined` = armazenamento indisponível.
let ultima: { bruto: string | null | undefined; leitura: Leitura } | null = null;

function bruto(): string | null | undefined {
  try {
    return armazenamento().getItem(CHAVE);
  } catch {
    return undefined;
  }
}

function ler(): Leitura {
  const atual = bruto();
  if (ultima === null || ultima.bruto !== atual) {
    ultima = {
      bruto: atual,
      leitura: atual === undefined ? { disponivel: false } : lerSacola(armazenamento, Date.now()),
    };
  }
  return ultima.leitura;
}

const assinar = (aoMudar: () => void) => assinarSacola(window, aoMudar);
const doServidor = (): Leitura | null => null;

export function useSacola(): Sacola | null {
  const leitura = useSyncExternalStore<Leitura | null>(assinar, ler, doServidor);
  return leitura?.disponivel ? leitura.sacola : null;
}
