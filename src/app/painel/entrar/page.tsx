import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
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

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <h1 className="text-2xl font-bold">Painel da loja</h1>
        {/* T031: estado de recusa (por ora igual a "falhou") */}
        {(aviso === "falhou" || aviso === "recusada") && (
          <p role="alert" className="text-base font-medium text-red-800">
            Não foi possível entrar agora. Tente de novo em instantes.
          </p>
        )}
        <form action={entrarComGoogle} className="flex w-full flex-col">
          <input type="hidden" name="callbackUrl" value={destino} />
          <Button type="submit" variant="primary">
            Entrar com Google
          </Button>
        </form>
      </main>
    </div>
  );
}
