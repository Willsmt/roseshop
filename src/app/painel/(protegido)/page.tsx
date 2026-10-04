import { requireAdminPage } from "@/lib/auth";

export default async function PainelPage() {
	const admin = await requireAdminPage("/painel");

	return (
		<h1 className="text-2xl font-bold">{`Olá, ${admin.name ?? admin.email}`}</h1>
	);
}
