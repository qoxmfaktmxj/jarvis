import { z } from "zod";

/**
 * Runtime schema + compile-time type for a Jarvis session blob.
 * Used by session.ts to validate data read from `user_session.data`
 * (which is typed `Record<string, unknown>` at the DB schema layer to
 * avoid a @jarvis/db → @jarvis/auth workspace cycle).
 */
export const jarvisSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  workspaceId: z.string(),
  employeeId: z.string(),
  name: z.string(),
  email: z.string().optional(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
  orgId: z.string().optional(),
  createdAt: z.number(),
  expiresAt: z.number(),
  keepSignedIn: z.boolean().optional().default(false),
});

export type JarvisSession = z.infer<typeof jarvisSessionSchema>;

export interface AuthContext {
  session: JarvisSession;
  isAuthenticated: true;
}

export interface UnauthContext {
  isAuthenticated: false;
}

export type RequestContext = AuthContext | UnauthContext;

export function isAuth(ctx: RequestContext): ctx is AuthContext {
  return ctx.isAuthenticated;
}
