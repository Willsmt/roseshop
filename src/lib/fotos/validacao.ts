import { z } from "zod";

// Id de envio (uuid gerado no servidor): só o formato com hífens, normalizado para minúsculas
// (o Postgres devolve minúsculas; duas grafias do mesmo id não podem passar como distintas).
export const uuidEnvio = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .transform((s) => s.toLowerCase());

// Fotos do cadastro (contracts/fotos.md §3): 1..3 ids distintos, na ordem recebida. O vazio é
// tratado antes (`sem_foto`).
export const envioIdsCadastro = z
  .array(uuidEnvio)
  .min(1)
  .max(3)
  .refine((ids) => new Set(ids).size === ids.length);
