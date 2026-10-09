import { type Motivo, mensagemDoMotivo } from "./mensagens";

// Falha devolvida às actions e ao domínio (contrato §3) e a tradução dos resultados
// da camada SQL (contrato §2) para ela.

export type CampoProduto = "nome" | "categoria" | "descricao" | "preco" | "aPartirDe";

export type ValoresFormulario = {
  nome: string;
  categoriaId: string;
  descricao: string;
  preco: string;
  aPartirDe: boolean;
};

export type Falha = {
  motivo: Motivo;
  mensagem: string;
  campo?: CampoProduto;
  codigoExistente?: number;
  envioIds?: string[]; // foto_expirada: os envios que precisam ser refeitos
  valores?: ValoresFormulario;
};

export type ResultadoSqlFalho =
  | { tipo: "ausente" }
  | { tipo: "versao_diferente" }
  | { tipo: "limite" }
  | { tipo: "vaga_disputada" }
  | { tipo: "esgotado" }
  | { tipo: "ja_em_destaque" }
  | { tipo: "categoria_ausente" }
  | { tipo: "nome_repetido"; codigoExistente?: number };

export function falhaDoResultado(r: ResultadoSqlFalho): Falha {
  const simples = (motivo: Motivo): Falha => ({ motivo, mensagem: mensagemDoMotivo(motivo) });
  switch (r.tipo) {
    case "ausente":
      return simples("nao_existe");
    case "versao_diferente":
      return simples("alterado");
    case "limite":
      return simples("limite_destaques");
    case "vaga_disputada":
      return simples("vaga_disputada");
    case "esgotado":
      return simples("esgotado_nao_destaca");
    case "ja_em_destaque":
      return simples("ja_em_destaque");
    case "categoria_ausente":
      return { ...simples("categoria_invalida"), campo: "categoria" };
    case "nome_repetido": {
      const dados = r.codigoExistente === undefined ? {} : { codigoExistente: r.codigoExistente };
      return {
        motivo: "nome_repetido",
        mensagem: mensagemDoMotivo("nome_repetido", dados),
        campo: "nome",
        ...dados,
      };
    }
  }
}
