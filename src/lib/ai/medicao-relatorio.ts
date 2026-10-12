// Feature 004, T132: tabela da medição manual da IA (`ia-medicao/resultado.md`, fora do git).
// Puro e sem server-only: o `medicao.ia.test.ts` coleta as linhas e grava o arquivo; a
// coluna "inventa?" fica em branco para o humano preencher (observação da T120a). Ordem e
// colunas em contracts/ia.md §5.

export type LinhaMedicao = {
  produto: string;
  modelo: string;
  esforco: string;
  rodada: number;
  esperada: string;
  resultado:
    | { ok: true; sugerida: string | null; nome: string | null; descricao: string | null }
    | { ok: false; falha: string };
};

// Célula de tabela Markdown: nunca corta o texto; escapa o pipe e troca quebra de linha por <br>.
export function celula(texto: string | null): string {
  const limpo = (texto ?? "").trim();
  if (limpo === "") return "—";
  return limpo.replace(/\|/g, "\\|").replace(/\r\n|\r|\n/g, "<br>");
}

const CABECALHO = [
  "Produto",
  "Modelo",
  "Esforço",
  "Categoria esperada",
  "Categoria sugerida",
  "Nome",
  "Descrição",
  "inventa?",
];

function linhaTabela(l: LinhaMedicao, rodadas: number): string {
  const r = l.resultado;
  const produto = rodadas > 1 ? `${l.produto} (rodada ${l.rodada})` : l.produto;
  const sugerida = r.ok ? (r.sugerida ?? "vazia") : `FALHA ${r.falha}`;
  const celulas = [
    produto,
    l.modelo,
    l.esforco,
    l.esperada,
    sugerida,
    r.ok ? r.nome : null,
    r.ok ? r.descricao : null,
  ].map(celula);
  return `| ${[...celulas, ""].join(" | ")} |`;
}

// Agrupa por produto, na ordem da primeira ocorrência (a do gabarito); dentro do produto, mantém
// a ordem recebida (candidato e depois rodada). Não muta a lista recebida.
function porProduto(linhas: LinhaMedicao[]): LinhaMedicao[] {
  const grupos = new Map<string, LinhaMedicao[]>();
  for (const l of linhas) {
    const grupo = grupos.get(l.produto);
    if (grupo) grupo.push(l);
    else grupos.set(l.produto, [l]);
  }
  return [...grupos.values()].flat();
}

export function montarResultadoMd(
  linhas: LinhaMedicao[],
  o: { data: string; rodadas: number },
): string {
  return [
    "# Medição da sugestão por IA (T132)",
    "",
    `Gerado em ${o.data}. Preencha a coluna "inventa?" com "sim" ou "não": a descrição ` +
      "afirma algo que a foto não mostra (tamanho, material, medida…)?",
    "",
    `| ${CABECALHO.join(" | ")} |`,
    `|${CABECALHO.map(() => "---").join("|")}|`,
    ...porProduto(linhas).map((l) => linhaTabela(l, o.rodadas)),
  ].join("\n") + "\n";
}
