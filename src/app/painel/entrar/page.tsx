import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LogoMarca } from "@/components/ui/logo";
import {
  entrarComGoogle,
  getAdminSession,
  loginNoticeFromError,
  safeCallbackPath,
} from "@/lib/auth";

type SearchParams = {
  callbackUrl?: string | string[];
  error?: string | string[];
};

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const destino = safeCallbackPath(sp.callbackUrl);

  if ((await getAdminSession()) !== null) {
    redirect(destino);
  }

  const aviso = loginNoticeFromError(sp.error);
  const recusada = aviso === "recusada";
  const mensagem =
    aviso === "recusada"
      ? "Esta conta Google não tem acesso ao painel. Tente entrar com outra conta."
      : aviso === "falhou"
        ? "Não foi possível entrar agora. Tente de novo em instantes. Se continuar assim, avise o Willians."
        : null;

  return (
    <div className="min-h-screen bg-superficie text-texto">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <LogoMarca className="size-16 text-acao" traco={3.5} />
        <h1 className="text-3xl">Painel da loja</h1>
        {mensagem !== null && (
          <p role="alert" className="w-full rounded-suave border-l-[6px] border-erro bg-erro-fundo px-4 py-3 text-left text-base font-bold text-texto">
            {mensagem}
          </p>
        )}
        <form action={entrarComGoogle} className="flex w-full flex-col">
          <input type="hidden" name="callbackUrl" value={destino} />
          {recusada && <input type="hidden" name="trocarConta" value="1" />}
          <Button type="submit" variant="primary">
            {recusada ? "Entrar com outra conta" : "Entrar com Google"}
          </Button>
        </form>
      </main>
    </div>
  );
}
