// Tipos das fotos de produto (contracts/fotos.md §3). Sem imports de runtime: seguros para o
// client.

export type MotivoFoto =
  | "formato"
  | "nao_abre"
  | "grande"
  | "pequena"
  | "nao_passou"
  | "nao_enviada"
  | "sem_foto"
  | "foto_expirada"
  | "alterado"
  | "limite"
  | "ultima"
  | "nao_existe"
  | "muitos_pendentes"
  | "falha_geral";

export type FotoVista = {
  posicao: number;
  arquivo: string; // "<uuid>.<ext>"
  url: string; // /painel/fotos/<arquivo>
};

export type Conjunto = { fotosVersao: number; fotos: FotoVista[] };

export type FalhaFoto = { motivo: MotivoFoto; mensagem: string; atual?: Conjunto };

export type ResultadoFotos = ({ ok: true } & Conjunto) | ({ ok: false } & FalhaFoto);
