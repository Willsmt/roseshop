// Feature 006, SF5 (research D9): hidrata uma ilha a partir do HTML do servidor, como no navegador.
// O HTML vem do renderToString (estado do servidor, `null`); depois o hydrateRoot lê o aparelho.
import { act, type ReactElement } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const raizes: { raiz: Root; container: HTMLElement }[] = [];

export async function hidratar(ui: ReactElement): Promise<{ html: string; container: HTMLElement }> {
  const html = renderToString(ui);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  await act(async () => {
    raizes.push({ raiz: hydrateRoot(container, ui), container });
  });
  return { html, container };
}

export async function desmontarTudo(): Promise<void> {
  for (const { raiz, container } of raizes.splice(0)) {
    await act(async () => raiz.unmount());
    container.remove();
  }
}

// Outra aba gravou: o navegador dispara `storage` só nas outras abas, com a chave alterada.
export async function outraAbaGravou(chave: string, valor: string | null): Promise<void> {
  await act(async () => {
    if (valor === null) window.localStorage.removeItem(chave);
    else window.localStorage.setItem(chave, valor);
    window.dispatchEvent(new StorageEvent("storage", { key: chave }));
  });
}
