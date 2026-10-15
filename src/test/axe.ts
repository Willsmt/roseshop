import axe from "axe-core";

// Roda o axe-core no container do Testing Library e devolve só as violações graves
// (`serious` e `critical`). jsdom não calcula layout nem cor: as regras de contraste ficam
// desligadas; o resto (nomes, rótulos, estrutura; o `lang` do <html> não entra no container) vale.
export async function violacoesGraves(container: HTMLElement): Promise<string[]> {
  const resultado = await axe.run(container, {
    rules: { "color-contrast": { enabled: false } },
  });
  return resultado.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(", ")})`);
}
