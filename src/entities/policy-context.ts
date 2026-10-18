import { isAdmin, type AuthUser } from '../common/auth-user.js';
import type { PrismaService } from '../prisma/prisma.service.js';

const notSuspended = { OR: [{ status: null }, { status: { not: 'suspended' } }] };

/** Who is asking, with cached lookups of the records they own (per request). */
export class PolicyContext {
  private readonly memo = new Map<string, Promise<string[]>>();

  constructor(
    readonly user: AuthUser | undefined,
    readonly prisma: PrismaService,
  ) {}

  get isAdmin(): boolean {
    return isAdmin(this.user);
  }

  get email(): string | undefined {
    return this.user?.email;
  }

  /** Lawyer profiles belonging to this user (suspended ones excluded). */
  lawyerIds(): Promise<string[]> {
    return this.cached('lawyers', async (email) =>
      (await this.prisma.lawyer.findMany({ where: { email, ...notSuspended }, select: { id: true } })).map((r) => r.id),
    );
  }

  /** Approved RoadGuard advocate profiles belonging to this user. */
  rglAdvocateIds(): Promise<string[]> {
    return this.cached('rglAdvocates', async (email) =>
      (
        await this.prisma.rGLAdvocate.findMany({ where: { lawyer_email: email, status: 'approved' }, select: { id: true } })
      ).map((r) => r.id),
    );
  }

  fleetOwnerIds(): Promise<string[]> {
    return this.cached('fleetOwners', async (email) =>
      (await this.prisma.fleetOwner.findMany({ where: { user_email: email }, select: { id: true } })).map((r) => r.id),
    );
  }

  /** Cases this user filed or is the assigned lawyer on. */
  caseIds(): Promise<string[]> {
    return this.cached('cases', async (email) => {
      const lawyerIds = await this.lawyerIds();
      const rows = await this.prisma.case.findMany({
        where: { OR: [{ client_email: email }, ...(lawyerIds.length ? [{ assigned_lawyer_id: { in: lawyerIds } }] : [])] },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    });
  }

  private cached(key: string, load: (email: string) => Promise<string[]>): Promise<string[]> {
    const email = this.email;
    if (!email) return Promise.resolve([]);
    if (!this.memo.has(key)) this.memo.set(key, load(email));
    return this.memo.get(key)!;
  }
}
