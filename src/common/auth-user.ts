/** The logged-in user attached to each request by the auth guard. */
export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
}

export const isAdmin = (user?: AuthUser | null): boolean => user?.role === 'admin';
