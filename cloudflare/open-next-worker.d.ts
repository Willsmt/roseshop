// O worker gerado pelo OpenNext (`.open-next/worker.js`), ligado a este nome pelo `alias` do
// wrangler.jsonc. Nome não relativo de propósito: declaração ambiente não resolve import relativo,
// e o `typecheck` dá o mesmo resultado com e sem build local (TL-6, ADR-009 emenda da D5).
// O `fetch` aceita qualquer `Request`, não só o `IncomingRequest` da borda: o `scheduled` monta o
// seu (a prova R3 mostrou a chamada em processo chegando ao Next).
declare module "open-next-worker" {
  const handler: ExportedHandler<CloudflareEnv> & {
    fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response>;
  };
  export default handler;
}
