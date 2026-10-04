import { Button } from "@/components/ui/button";
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
    <div className="min-h-screen bg-white text-neutral-900">
      <BfcacheReload />
      <header className="flex flex-col gap-3 border-b border-neutral-300 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-lg font-bold">Painel da loja</p>
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
