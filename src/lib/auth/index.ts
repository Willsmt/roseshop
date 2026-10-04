import "server-only";

// Única porta de entrada para a UI: componentes importam de "@/lib/auth",
// nunca de "next-auth" diretamente.
export { safeCallbackPath } from "./callback-path";
export {
  type AdminSession,
  getAdminSession,
  requireAdminAction,
  requireAdminPage,
  UnauthorizedError,
} from "./guard";
export { auth, handlers, signIn, signOut } from "./instance";
