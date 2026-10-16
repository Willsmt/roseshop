// Abre o WhatsApp na mesma aba (research D11): sem window.open, que o bloqueador de pop-up barra
// depois de um await. Separado para os testes observarem a navegação (o jsdom não navega).
export function abrirWhatsapp(url: string): void {
  window.location.assign(url);
}
