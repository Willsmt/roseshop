import type { Analise, RegraVerificacao } from "./analise";
import { analisarJpeg } from "./jpeg";
import type { ModoVerificacao } from "./modo";
import { analisarWebp } from "./webp";

export type { RegraVerificacao } from "./analise";
export { ICC_LIMITE_BYTES, verificarIcc } from "./icc";
export { modoVerificacao, type ModoVerificacao } from "./modo";

// Verificação do arquivo por lista de permitidos (contracts/fotos.md §4,
// ADR-009 D3): lê o arquivo inteiro, sem decodificar a imagem (VII).

export type FormatoImagem = "jpeg" | "webp";

export type MotivoVerificacao =
  | "formato"
  | "corrompida"
  | "metadado"
  | "animada"
  | "pequena"
  | "dimensao";

export type ResultadoVerificacao =
  | { ok: true; formato: FormatoImagem; lado: number; blocos: string[] }
  | { ok: false; motivo: MotivoVerificacao; regra: RegraVerificacao; blocos: string[] };

export const LADO_MINIMO = 400;
export const LADO_MAXIMO = 1200;

function detectar(bytes: Uint8Array): FormatoImagem | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  const ascii = (i: number, n: number) => String.fromCharCode(...bytes.subarray(i, i + n));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "webp";
  return null;
}

export function verificarImagem(
  bytes: Uint8Array,
  opcoes: { declarado: FormatoImagem; modo: ModoVerificacao },
): ResultadoVerificacao {
  const formato = detectar(bytes);
  if (formato === null) return { ok: false, motivo: "formato", regra: "assinatura", blocos: [] };
  if (formato !== opcoes.declarado) {
    return { ok: false, motivo: "formato", regra: "declarado", blocos: [] };
  }

  const a: Analise = formato === "jpeg" ? analisarJpeg(bytes) : analisarWebp(bytes);
  const recusa = (motivo: MotivoVerificacao, regra: RegraVerificacao): ResultadoVerificacao => ({
    ok: false,
    motivo,
    regra,
    blocos: a.blocos,
  });

  if (a.falha) return recusa(a.falha, a.regra);
  if (a.formato) return recusa("formato", a.formato);
  if (a.animada) return recusa("animada", a.animada);
  // O modo registro relaxa só o metadado; o resto continua recusando.
  if (a.metadado && opcoes.modo !== "registro") return recusa("metadado", a.metadado);
  if (a.largura !== a.altura) return recusa("dimensao", "nao_quadrada");
  if (a.largura > LADO_MAXIMO) return recusa("dimensao", "lado_maior");
  if (a.largura < LADO_MINIMO) return recusa("pequena", "lado_menor");
  return { ok: true, formato, lado: a.largura, blocos: a.blocos };
}
