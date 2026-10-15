import "server-only";

import { registrarFalha } from "./registro";

// Configuração do catálogo público (research D10, D12). Lida de process.env no momento do uso,
// como `configR2`. Valor inválido nunca derruba a página: o campo vira `null` (sem botão do
// WhatsApp, mensagem sem link) e a falha é registrada sem o valor.
const E164 = /^\+[1-9]\d{7,14}$/;
const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1"]);

export type ConfigCatalogo = { whatsapp: string | null; siteUrl: string | null };

function siteUrlValida(valor: string): boolean {
  if (valor.endsWith("/") || !URL.canParse(valor)) return false;
  const { protocol, hostname } = new URL(valor);
  return protocol === "https:" || (protocol === "http:" && HOSTS_LOCAIS.has(hostname));
}

// [FALLBACK] toda visita renderiza: registrar uma vez por isolate poupa o teto diário do
// Workers Logs (D10).
let whatsappRegistrado = false;
let siteUrlRegistrada = false;

export function configCatalogo(): ConfigCatalogo {
  const numero = process.env.WHATSAPP_NUMBER;
  const url = process.env.SITE_URL;

  const whatsapp = numero !== undefined && E164.test(numero) ? numero : null;
  if (whatsapp === null && !whatsappRegistrado) {
    whatsappRegistrado = true;
    registrarFalha({ evento: "catalogo.whatsapp_invalido", rota: "configuracao", causa: "config" });
  }

  const siteUrl = url !== undefined && siteUrlValida(url) ? url : null;
  if (siteUrl === null && !siteUrlRegistrada) {
    siteUrlRegistrada = true;
    registrarFalha({ evento: "catalogo.site_url_invalida", rota: "configuracao", causa: "config" });
  }

  return { whatsapp, siteUrl };
}
