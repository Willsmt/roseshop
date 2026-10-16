import { describe, expect, it } from "vitest";

import { type Ambiente, motivoSemTresD } from "./condicoes";

// Fase 7 (ADR-005): o logo 3D só carrega quando nada pede o contrário.

const bom: Ambiente = {
  movimentoReduzido: false,
  economiaDeDados: false,
  nucleos: 8,
  memoria: 4,
  temWebGL: () => true,
};

describe("motivoSemTresD", () => {
  it("aparelho capaz, sem pedido de menos movimento: carrega o 3D", () => {
    expect(motivoSemTresD(bom)).toBeNull();
  });

  it.each([
    ["movimento reduzido", { movimentoReduzido: true }, "movimento-reduzido"],
    ["economia de dados", { economiaDeDados: true }, "economia-de-dados"],
    ["4 núcleos", { nucleos: 4 }, "processador-fraco"],
    ["2 núcleos", { nucleos: 2 }, "processador-fraco"],
    ["núcleos desconhecidos", { nucleos: undefined }, "processador-fraco"],
    ["2 GB de memória", { memoria: 2 }, "pouca-memoria"],
    ["sem WebGL", { temWebGL: () => false }, "sem-webgl"],
  ] as const)("%s: fica o SVG", (_nome, troca, motivo) => {
    expect(motivoSemTresD({ ...bom, ...troca })).toBe(motivo);
  });

  it("memória não informada não impede (só Chrome informa)", () => {
    expect(motivoSemTresD({ ...bom, memoria: undefined })).toBeNull();
  });

  it("não cria contexto WebGL quando outro motivo já decidiu", () => {
    let chamado = false;
    motivoSemTresD({ ...bom, movimentoReduzido: true, temWebGL: () => (chamado = true) });
    expect(chamado).toBe(false);
  });
});
