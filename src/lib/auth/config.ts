import "server-only";

import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

import { decideSignIn, parseAllowlist } from "./allowlist";
import { safeCallbackPath } from "./callback-path";

const THIRTY_DAYS_IN_SECONDS = 30 * 24 * 60 * 60;
const ONE_DAY_IN_SECONDS = 24 * 60 * 60;

function toPathIfSameOrigin(url: string, baseUrl: string): string | null {
  if (url.startsWith("/")) return url;
  try {
    const parsed = new URL(url);
    return parsed.origin === baseUrl ? `${parsed.pathname}${parsed.search}${parsed.hash}` : null;
  } catch {
    return null;
  }
}

// Chamada a cada request (NextAuth(() => createAuthConfig())): credenciais do
// Google e ADMIN_EMAILS saem de process.env no momento do uso, que o OpenNext
// preenche com os secrets do Worker. AUTH_SECRET o Auth.js lê sozinho dali.
export function createAuthConfig(): NextAuthConfig {
  return {
    providers: [
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    ],
    // Sem adapter: a sessão vive só no cookie JWT, então "Sair" encerra
    // apenas este aparelho e a troca do AUTH_SECRET derruba todos.
    session: {
      strategy: "jwt",
      maxAge: THIRTY_DAYS_IN_SECONDS,
      updateAge: ONE_DAY_IN_SECONDS,
    },
    pages: {
      signIn: "/painel/entrar",
      error: "/painel/entrar",
    },
    // O host vem do Worker; não há AUTH_URL fixo por ambiente.
    trustHost: true,
    callbacks: {
      // Logs só com o código do evento: e-mail e nome nunca vão para o log.
      signIn({ profile }) {
        const raw = process.env.ADMIN_EMAILS;
        if (parseAllowlist(raw).size === 0) console.warn("auth.allowlist.vazia");
        const allowed = decideSignIn(
          { email: profile?.email, emailVerified: profile?.email_verified },
          raw,
        );
        if (!allowed) console.warn("auth.signin.recusado");
        return allowed;
      },
      redirect({ url, baseUrl }) {
        return `${baseUrl}${safeCallbackPath(toPathIfSameOrigin(url, baseUrl))}`;
      },
      jwt({ token }) {
        return { email: token.email, name: token.name };
      },
      session({ session, token }) {
        return {
          ...session,
          user: { email: token.email, name: token.name ?? null },
        } as typeof session;
      },
    },
  };
}
