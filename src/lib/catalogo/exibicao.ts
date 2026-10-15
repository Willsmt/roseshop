// Regras puras de exibição do catálogo (contrato §6). Sem server-only: componentes cliente
// importam este arquivo.

import { formatarAPartirDe, formatarPreco } from "@/lib/produtos/preco";

export function precoPublico(centavos: number | null, aPartirDe: boolean): string {
  if (centavos === null) return "Consulte o valor";
  return aPartirDe ? formatarAPartirDe(centavos) : formatarPreco(centavos);
}

// Código canônico da URL: o id com zeros à esquerda (4 dígitos), sem "#".
export function codigoCanonico(id: number): string {
  return String(id).padStart(4, "0");
}

export function hrefProduto(id: number): string {
  return `/p/${codigoCanonico(id)}`;
}

export function altFoto(nome: string, posicao: number, total: number): string {
  return `${nome} — foto ${posicao} de ${total}`;
}

// FR-018: sem siteUrl a mensagem sai sem o link.
export function mensagemWhatsapp(nome: string, id: number, siteUrl: string | null): string {
  const base = `Olá! Tenho interesse no produto ${nome} (#${codigoCanonico(id)})`;
  return siteUrl === null ? base : `${base}: ${siteUrl}${hrefProduto(id)}`;
}

// `whatsapp` é E.164 (+5511...); o wa.me quer só os dígitos.
export function linkWhatsapp(whatsapp: string, mensagem: string): string {
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

// Esgotado ou sem número configurado: sem botão do WhatsApp (FR-018). Regra única da lib e da tela.
export function mostrarWhatsapp(esgotado: boolean, temNumero: boolean): boolean {
  return !esgotado && temNumero;
}
