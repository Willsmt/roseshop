// Cursor opaco da lista: base64url("<µs>.<id>") (data-model §3, research D8). O µs fica
// sempre como texto: nunca passa por number nem Date, que perderiam precisão.

import { z } from "zod";

const MAX_ID = 2_147_483_647;

const conteudo = z.string().regex(/^\d{1,17}\.\d{1,10}$/);

export type Cursor = { micros: string; id: number };

export function codificarCursor(micros: string, id: number): string {
  return Buffer.from(`${micros}.${id}`, "utf8").toString("base64url");
}

export function lerCursor(texto: string): Cursor | null {
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) return null;
  const decodificado = Buffer.from(texto, "base64url").toString("utf8");
  const ok = conteudo.safeParse(decodificado);
  if (!ok.success) return null;
  const [micros, idTexto] = ok.data.split(".");
  const id = Number(idTexto);
  if (id < 1 || id > MAX_ID) return null;
  return { micros, id };
}
