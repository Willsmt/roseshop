// Rola a página até o fim e volta ao topo, para as fotos com loading="lazy" carregarem antes da
// captura de página inteira (chrome-devtools evaluate_script).
async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, 300));
  return document.images.length;
}
