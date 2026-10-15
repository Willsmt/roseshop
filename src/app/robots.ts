import type { MetadataRoute } from "next";

// Sem `Disallow` e sem `sitemap` (research D9): um `Disallow` impediria o buscador de ler o
// `noindex` das páginas e do cabeçalho `X-Robots-Tag`.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
