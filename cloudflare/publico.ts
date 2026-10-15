import { type CausaFalha, registrarFalha, type RotaFalha } from "../src/lib/catalogo/falha";
import { NAVEGADOR_PAGINA_S } from "../src/lib/catalogo/prazos";

// Rotas públicas do catálogo (contracts/publico.md §1, research D4/D5/D9/D11), ramo FALLBACK
// (T008): sem repetição do pedido no 500, sem fila de revalidação. Funções puras, testadas sem
// workerd. Importa só módulos puros (`falha`, `prazos`) por caminho relativo: o bundle do worker não
// resolve o alias `@/`. Painel, `/api/auth`, `/api/interno`, `/api/health` e assets nunca são
// alterados.

const SO_DIGITOS = /^\d{1,9}$/;
const DETALHE = /^\/p\/([^/]+)$/;

export type Pedido =
  | { tipo: "seguir" }
  | { tipo: "reescrever"; caminho: "/p/0" }
  | { tipo: "redirecionar"; destino: string };

const SEGUIR: Pedido = { tipo: "seguir" };

const ehLeitura = (metodo: string) => metodo === "GET" || metodo === "HEAD";

// Antes do Next. Só GET/HEAD em `/p/<x>` (um segmento).
export function prepararPedido(url: URL, metodo: string): Pedido {
  if (!ehLeitura(metodo)) return SEGUIR;
  const achou = DETALHE.exec(url.pathname);
  if (!achou) return SEGUIR;
  const x = achou[1];
  // Lixo, zero e mais de 9 dígitos (o teto do `integer` do Postgres, 2.147.483.647, tem 10) vão
  // para o caminho fixo que o Next responde como "Produto não encontrado": nenhuma entrada nova
  // de cache por URL inventada (P8).
  const n = SO_DIGITOS.test(x) ? Number(x) : 0;
  if (n < 1) return { tipo: "reescrever", caminho: "/p/0" };
  const canonico = String(n).padStart(4, "0");
  if (x === canonico) return SEGUIR;
  return { tipo: "redirecionar", destino: `/p/${canonico}${url.search}` };
}

type Classe = "pagina" | "fotos" | "api" | "fora";

function classificar(caminho: string): Classe {
  if (caminho === "/" || caminho.startsWith("/p/")) return "pagina";
  if (caminho.startsWith("/fotos/")) return "fotos";
  if (caminho.startsWith("/api/catalogo/")) return "api";
  return "fora";
}

const ROBOTS = "noindex, nofollow";
const STATUS_COM_PRAZO = new Set([200, 308, 404]);

function comCabecalhos(
  resposta: Response,
  status: number,
  ajustar: (h: Headers) => void,
): Response {
  const cabecalhos = new Headers(resposta.headers);
  ajustar(cabecalhos);
  // O `statusText` só vale para o status original (503 com "Internal Server Error" seria mentira).
  const statusText = status === resposta.status ? resposta.statusText : "";
  return new Response(resposta.body, { status, statusText, headers: cabecalhos });
}

// Depois do Next. `causa` é a marca que `leitura.ts` deixou no `ctx` do pedido (D11).
export function ajustarResposta(
  caminho: string,
  resposta: Response,
  causa: CausaFalha | null,
): Response {
  const classe = classificar(caminho);
  if (classe === "fora") return resposta;

  if (classe !== "pagina") {
    return comCabecalhos(resposta, resposta.status, (h) => h.set("X-Robots-Tag", ROBOTS));
  }

  if (resposta.status === 500) {
    const banco = causa === "banco";
    const rota: RotaFalha = caminho === "/" ? "/" : "/p/[codigo]";
    registrarFalha({
      evento: banco ? "catalogo.banco_indisponivel" : "catalogo.erro_inesperado",
      rota,
      causa: banco ? "banco" : "inesperado",
      resultado: "503",
    });
    return comCabecalhos(resposta, 503, (h) => {
      h.set("Cache-Control", "no-store");
      h.set("Retry-After", "30");
      h.set("X-Robots-Tag", ROBOTS);
    });
  }

  return comCabecalhos(resposta, resposta.status, (h) => {
    if (STATUS_COM_PRAZO.has(resposta.status)) {
      h.set("Cache-Control", `public, max-age=${NAVEGADOR_PAGINA_S}`);
    }
    h.set("X-Robots-Tag", ROBOTS);
  });
}

type Fetch = (request: Request, env: CloudflareEnv, ctx: ExecutionContext) => Promise<Response>;

type Marca = { causa: CausaFalha | null };

// `ctx` do pedido: o OpenNext o devolve em `getCloudflareContext().ctx` (D11). Os métodos do
// original ficam presos a ele (`{ ...ctx }` os perderia: estão no protótipo).
function ctxDoPedido(ctx: ExecutionContext, marca: Marca): ExecutionContext {
  return {
    waitUntil: ctx.waitUntil.bind(ctx),
    passThroughOnException: ctx.passThroughOnException.bind(ctx),
    props: ctx.props,
    roseshop: marca,
  } as unknown as ExecutionContext;
}

export function criarFetch(handler: Fetch): Fetch {
  return async (request, env, ctx) => {
    const url = new URL(request.url);
    const classe = classificar(url.pathname);
    // Fora do catálogo (painel, auth, interno, health, assets) e métodos que não leem: o handler
    // recebe o pedido e o `ctx` originais e a resposta volta intacta.
    if (classe === "fora" || !ehLeitura(request.method)) return handler(request, env, ctx);

    let alvo = request;
    let caminho = url.pathname;
    const preparo = prepararPedido(url, request.method);
    if (preparo.tipo === "redirecionar") {
      const destino = new URL(preparo.destino, url);
      return ajustarResposta(
        url.pathname,
        new Response(null, { status: 308, headers: { Location: destino.toString() } }),
        null,
      );
    }
    if (preparo.tipo === "reescrever") {
      caminho = preparo.caminho;
      alvo = new Request(new URL(preparo.caminho, url), request);
    }

    const marca: Marca = { causa: null };
    let resposta: Response;
    try {
      resposta = await handler(alvo, env, ctxDoPedido(ctx, marca));
    } catch (erro) {
      if (classe !== "pagina") throw erro;
      resposta = new Response(null, { status: 500 });
    }
    return ajustarResposta(caminho, resposta, marca.causa);
  };
}
