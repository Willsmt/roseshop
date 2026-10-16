import { Button } from "@/components/ui/button";
import { LogoMarca } from "@/components/ui/logo";
import { getAdminSession, sair } from "@/lib/auth";

import { BfcacheReload } from "./bfcache-reload";

export default async function ProtegidoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await getAdminSession();

  if (admin === null) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-superficie text-texto">
      <BfcacheReload />
      <header className="flex flex-col gap-3 border-b border-linha bg-superficie-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 font-titulo text-2xl">
          <LogoMarca className="size-8 shrink-0 text-acao" />
          Painel da loja
        </p>
        <form action={sair}>
          <Button type="submit" variant="secondary">
            Sair
          </Button>
        </form>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
