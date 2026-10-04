import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// O painel nunca vai para cache compartilhado nem do navegador: depois de
	// "Sair", o "voltar" precisa refazer a verificação de sessão no servidor.
	async headers() {
		return [
			{
				source: "/painel/:path*",
				headers: [{ key: "Cache-Control", value: "private, no-store" }],
			},
		];
	},
};

export default nextConfig;

// Enable calling `getCloudflareContext()` in `next dev`.
// See https://opennext.js.org/cloudflare/bindings#local-access-to-bindings.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
