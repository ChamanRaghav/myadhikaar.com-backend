import { Injectable } from '@nestjs/common';
import type { Prisma, Wallet } from '../generated/prisma/client.js';
import { EntityEvents } from '../entities/entity-events.js';

type Tx = Prisma.TransactionClient;

export interface LedgerEntry {
  type: 'topup' | 'deduction' | 'refund' | 'bonus';
  description: string;
  reference_id?: string;
  payment_method?: string;
  lawyer_name?: string;
  consultation_id?: string;
  duration_minutes?: number;
  rate_per_min?: number;
}

export const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Every wallet balance change goes through here, inside the caller's transaction, so the
 * balance and its ledger (WalletTransaction) always move together.
 */
@Injectable()
export class WalletService {
  constructor(private readonly events: EntityEvents) {}

  /**
   * Locks the user's wallet row for the rest of the transaction, creating the wallet if
   * needed. An advisory lock per email stops two requests creating two wallets.
   */
  async lock(tx: Tx, email: string): Promise<{ wallet: Wallet; created: boolean }> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'wallet:' + email}))`;
    const existing = await tx.wallet.findFirst({ where: { user_email: email }, orderBy: { created_date: 'asc' } });
    if (existing) {
      const [locked] = await tx.$queryRaw<Wallet[]>`SELECT * FROM "wallets" WHERE "id" = ${existing.id} FOR UPDATE`;
      return { wallet: locked, created: false };
    }
    const wallet = await tx.wallet.create({
      data: { user_email: email, balance: 0, bonus_balance: 0, total_recharged: 0, total_spent: 0, created_by: email },
    });
    return { wallet, created: true };
  }

  /** Call after the transaction commits for wallets that `lock` created (welcome email). */
  announce(wallet: Wallet, created: boolean): void {
    if (created) this.events.created('Wallet', wallet);
  }

  async credit(tx: Tx, wallet: Wallet, amount: number, entry: LedgerEntry, bonus = 0): Promise<Wallet> {
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: { increment: money(amount) },
        bonus_balance: { increment: money(bonus) },
        total_recharged: entry.type === 'topup' ? { increment: money(amount) } : undefined,
      },
    });
    await this.record(tx, wallet.user_email!, money(amount), entry);
    if (bonus > 0) {
      await this.record(tx, wallet.user_email!, money(bonus), {
        type: 'bonus',
        description: `Bonus credit on ₹${money(amount)} recharge`,
        reference_id: entry.reference_id ? `${entry.reference_id}_bonus` : undefined,
      });
    }
    return updated;
  }

  /** Takes up to `amount` from a locked wallet and returns what was actually charged. */
  async debitUpTo(tx: Tx, wallet: Wallet, amount: number, entry: LedgerEntry): Promise<{ charged: number; wallet: Wallet }> {
    const charged = money(Math.max(0, Math.min(amount, wallet.balance ?? 0)));
    if (charged <= 0) return { charged: 0, wallet };
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: charged }, total_spent: { increment: charged } },
    });
    await this.record(tx, wallet.user_email!, charged, { ...entry, type: 'deduction' });
    return { charged, wallet: updated };
  }

  private async record(tx: Tx, email: string, amount: number, entry: LedgerEntry): Promise<void> {
    await tx.walletTransaction.create({
      data: { user_email: email, amount, net_amount: amount, status: 'completed', created_by: email, ...entry },
    });
  }
}
