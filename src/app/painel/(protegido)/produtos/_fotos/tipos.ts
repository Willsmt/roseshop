// Estado de cada foto no passo Fotos do cadastro (contrato interno da SF9).

export type EstadoFoto =
	| { tipo: "enviando" }
	| { tipo: "enviada"; envioId: string }
	| { tipo: "nao_enviada"; mensagem: string; podeTentar: boolean };

// previa: blob URL do blob tratado; null enquanto ele não existe (espaço reservado com
// "Enviando…") ou depois de solto (muitos_pendentes: a mensagem fica no lugar da miniatura).
export type FotoLocal = { chave: string; previa: string | null; estado: EstadoFoto };
