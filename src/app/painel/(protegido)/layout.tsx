import { getAdminSession } from "@/lib/auth";

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
      <header className="border-b border-neutral-300 px-4 py-4">
        <p className="text-lg font-bold">Painel da loja</p>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-6">{children}</main>
    </div>
  );
}
