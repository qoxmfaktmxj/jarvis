export interface JarvisSession {
  id: string;
  userId: string;
  workspaceId: string;
  employeeId: string;
  name: string;
  email?: string;
  roles: string[];
  permissions: string[];
  orgId?: string;
  createdAt: number;
  expiresAt: number;
}

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
