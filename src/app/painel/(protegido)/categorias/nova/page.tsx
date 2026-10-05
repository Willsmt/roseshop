import { requireAdminPage } from "@/lib/auth";

import { FormCriar } from "./form-criar";

export default async function NovaCategoriaPage() {
	await requireAdminPage("/painel/categorias/nova");

	return (
		<div className="flex flex-col gap-6">
			<h1 className="text-2xl font-bold">Nova categoria</h1>
			<FormCriar />
		</div>
	);
}
