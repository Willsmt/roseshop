import "server-only";

import NextAuth from "next-auth";

import { createAuthConfig } from "./config";

// Separado do index.ts para que guard.ts e actions.ts importem a instância
// sem ciclo com o barrel público.
export const { handlers, auth, signIn, signOut } = NextAuth(() => createAuthConfig());
