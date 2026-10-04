"use client";

import { useEffect } from "react";

// Depois de "Sair", o botão Voltar pode restaurar a página do painel do bfcache
// sem passar pelo servidor. Recarregar força o guard a rodar de novo (R8).
export function BfcacheReload(): null {
  useEffect(() => {
    const handler = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", handler);
    return () => window.removeEventListener("pageshow", handler);
  }, []);

  return null;
}
