import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../common/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { money } from '../wallet/wallet.service.js';

/** Server-side versions of writes the browser used to make directly. */
@Injectable()
export class CommunityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Rating update, allowed once per completed consultation with that lawyer. */
  async submitLawyerReview(user: AuthUser, body: { lawyer_id?: string; consultation_id?: string; rating?: number; comment?: string }) {
    const rating = Number(body.rating);
    if (!body.lawyer_id || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('lawyer_id and a rating from 1 to 5 are required');
    }
    const consultation = await this.prisma.consultation.findFirst({
      where: { lawyer_id: body.lawyer_id, client_email: user.email, status: 'completed', ...(body.consultation_id ? { id: body.consultation_id } : {}) },
      orderBy: { created_date: 'desc' },
    });
    if (!consultation) throw new ForbiddenException('You can review a lawyer after a completed consultation');
    const reviewed = await this.prisma.message.findFirst({ where: { case_id: consultation.id, sender_email: user.email, sender_role: 'client' } });
    if (reviewed) throw new BadRequestException('You already reviewed this consultation');

    return this.prisma.$transaction(async (tx) => {
      const [lawyer] = await tx.$queryRaw<{ rating: number | null; total_reviews: number | null }[]>`
        SELECT rating, total_reviews FROM "lawyers" WHERE id = ${body.lawyer_id} FOR UPDATE`;
      if (!lawyer) throw new NotFoundException('Lawyer not found');
      const total = (lawyer.total_reviews ?? 0) + 1;
      const average = Math.round((((lawyer.rating ?? 0) * (total - 1) + rating) / total) * 10) / 10;
      await tx.lawyer.update({ where: { id: body.lawyer_id }, data: { rating: average, total_reviews: total } });
      // Kept as a case message, as the review page did before
      await tx.message.create({
        data: {
          case_id: consultation.id,
          sender_email: user.email,
          sender_name: user.full_name,
          sender_role: 'client',
          content: `★ ${rating}/5${body.comment ? ` — ${body.comment.slice(0, 2000)}` : ''}`,
          created_by: user.email,
        },
      });
      return { success: true, rating: average, total_reviews: total };
    });
  }

  /** Withdraws referral earnings: checks and lowers the balance atomically. */
  async requestReferralWithdrawal(user: AuthUser, body: Record<string, unknown>) {
    const amount = money(Number(body.amount));
    if (!Number.isFinite(amount) || amount < 100) throw new BadRequestException('Minimum withdrawal is ₹100');
    return this.prisma.$transaction(async (tx) => {
      const referral = await tx.rGLReferral.findFirst({ where: { user_email: user.email } });
      if (!referral) throw new NotFoundException('You have no referral account');
      const { count } = await tx.rGLReferral.updateMany({
        where: { id: referral.id, available_balance: { gte: amount } },
        data: { available_balance: { decrement: amount }, total_withdrawn: { increment: amount } },
      });
      if (!count) throw new BadRequestException('Amount is more than your available balance');
      const pick = (k: string) => (typeof body[k] === 'string' ? (body[k] as string).slice(0, 100) : undefined);
      return tx.rGLWithdrawal.create({
        data: {
          referrer_email: user.email,
          referrer_name: user.full_name,
          referral_code: referral.referral_code,
          amount,
          account_holder: pick('account_holder'),
          account_number: pick('account_number'),
          ifsc_code: pick('ifsc_code'),
          bank_name: pick('bank_name'),
          upi_id: pick('upi_id'),
          status: 'pending',
          created_by: user.email,
        },
      });
    });
  }
}
