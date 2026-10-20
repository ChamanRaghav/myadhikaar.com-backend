import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { PromoCode } from '../generated/prisma/client.js';
import { money } from '../wallet/wallet.service.js';
import { SERVICE_CATALOG } from './service-catalog.js';

// Everything the server charges is decided here — never by amounts sent from the browser.

// ── Wallet recharges ─────────────────────────────────────────────────

/** Bonus credited on exact pack amounts, as offered on the Add Money screen. */
export const WALLET_PACK_BONUS: Record<number, number> = { 1000: 100, 2000: 250, 5000: 750 };
export const WALLET_MIN = 1;
export const WALLET_MAX = 100_000;

/** Fixed-price coupons. WALLET500 was unlimited in the Base44 app; it's now once per account. */
export const WALLET_COUPONS: Record<string, { charge: number; credit: number; bonus: number; oncePerUser: boolean }> = {
  WALLET500: { charge: 2, credit: 500, bonus: 0, oncePerUser: true },
};

export interface WalletQuote {
  charge: number;
  credit: number;
  bonus: number;
  coupon?: string;
}

export function quoteWallet(amount?: number, coupon?: string): WalletQuote {
  if (coupon) {
    const code = coupon.trim().toUpperCase();
    const c = WALLET_COUPONS[code];
    if (!c) throw new BadRequestException('Invalid coupon code');
    return { charge: c.charge, credit: c.credit, bonus: c.bonus, coupon: code };
  }
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < WALLET_MIN || amount > WALLET_MAX) {
    throw new BadRequestException(`Recharge amount must be between ₹${WALLET_MIN} and ₹${WALLET_MAX}`);
  }
  const charge = money(amount);
  return { charge, credit: charge, bonus: WALLET_PACK_BONUS[charge] ?? 0 };
}

// ── Legal services ───────────────────────────────────────────────────

export interface ServiceQuote {
  slug: string;
  title: string;
  package_name: string | null;
  price: number;
}

export function quoteService(slugOrTitle: string, packageName?: string | null): ServiceQuote {
  const key = slugOrTitle.trim().toLowerCase();
  const found = Object.entries(SERVICE_CATALOG).find(([slug, s]) => slug === key || s.title.toLowerCase() === key);
  if (!found) throw new BadRequestException('Unknown service');
  const [slug, service] = found;
  if (packageName) {
    const price = service.packages[packageName];
    if (price === undefined) throw new BadRequestException(`Unknown package "${packageName}" for ${service.title}`);
    return { slug, title: service.title, package_name: packageName, price };
  }
  if (!service.professional_fee) throw new BadRequestException('Choose a package');
  return { slug, title: service.title, package_name: null, price: service.professional_fee };
}

// ── RoadGuard Legal plans ────────────────────────────────────────────

export const RGL_PLANS = ['kavach', 'suraksha', 'rakshak'] as const;
export type RglPlan = (typeof RGL_PLANS)[number];
export const RGL_PLAN_NAMES: Record<RglPlan, string> = { kavach: 'Kavach', suraksha: 'Suraksha', rakshak: 'Rakshak' };

/** Monthly price per vehicle by vehicle type, in plan order (from the RoadGuard Legal page). */
export const RGL_VEHICLE_PRICES: Record<string, [number, number, number]> = {
  cab: [439, 615, 879],
  lcv: [549, 769, 1099],
  truck: [769, 1099, 1539],
  bus: [989, 1429, 1979],
};

export const RGL_BILLING_PERIODS: Record<string, { months: number; discount: number }> = {
  yearly: { months: 12, discount: 20 },
  half_yearly: { months: 6, discount: 10 },
  quarterly: { months: 3, discount: 5 },
  monthly: { months: 1, discount: 0 },
};

/** A 100% promo still charges ₹2 so the payment method is verified (as before). */
export const RGL_FULL_DISCOUNT_CHARGE = 2;
export const RGL_MAX_FLEET = 500;

export interface RglQuoteInput {
  plan: string;
  vehicle_type: string;
  fleet_size: number;
  billing_period: string;
  promo_code?: string;
}

export interface RglQuote {
  plan: RglPlan;
  plan_name: string;
  vehicle_type: string;
  fleet_size: number;
  billing_period: string;
  months: number;
  monthly_rate: number;
  subtotal: number;
  period_discount: number;
  promo_code?: string;
  promo_discount: number;
  amount: number;
}

export async function quoteRgl(prisma: PrismaService, input: RglQuoteInput): Promise<RglQuote> {
  const plan = input.plan?.toLowerCase() as RglPlan;
  const planIndex = RGL_PLANS.indexOf(plan);
  if (planIndex < 0) throw new BadRequestException('Unknown plan');
  const rates = RGL_VEHICLE_PRICES[input.vehicle_type];
  if (!rates) throw new BadRequestException('Unknown vehicle type');
  const period = RGL_BILLING_PERIODS[input.billing_period];
  if (!period) throw new BadRequestException('Unknown billing period');
  const fleet = input.fleet_size;
  if (!Number.isInteger(fleet) || fleet < 1 || fleet > RGL_MAX_FLEET) throw new BadRequestException(`Fleet size must be 1-${RGL_MAX_FLEET}`);

  const monthly_rate = rates[planIndex];
  const subtotal = monthly_rate * fleet * period.months;
  const period_discount = Math.round((subtotal * period.discount) / 100);
  const afterPeriod = subtotal - period_discount;

  let promoPct = 0;
  let promo_code: string | undefined;
  if (input.promo_code?.trim()) {
    const promo = await findValidPromo(prisma, input.promo_code, 'roadguard');
    if (!promo) throw new BadRequestException('Invalid or expired promo code');
    promoPct = Math.min(100, Math.max(0, promo.value ?? 0));
    promo_code = promo.code ?? undefined;
  }
  const promo_discount = Math.round((afterPeriod * promoPct) / 100);
  const amount = promoPct >= 100 ? RGL_FULL_DISCOUNT_CHARGE : Math.max(1, afterPeriod - promo_discount);
  return {
    plan,
    plan_name: RGL_PLAN_NAMES[plan],
    vehicle_type: input.vehicle_type,
    fleet_size: fleet,
    billing_period: input.billing_period,
    months: period.months,
    monthly_rate,
    subtotal,
    period_discount,
    promo_code,
    promo_discount,
    amount,
  };
}

/** Admin-managed percentage promo codes: active, in date, not used up, and for this product. */
export async function findValidPromo(prisma: PrismaService, code: string, product: string): Promise<PromoCode | null> {
  const promo = await prisma.promoCode.findFirst({
    where: { code: { equals: code.trim(), mode: 'insensitive' }, is_active: true, type: 'discount_percent' },
  });
  if (!promo) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (promo.applicable_for && !['all', product].includes(promo.applicable_for)) return null;
  if (promo.valid_from && promo.valid_from.slice(0, 10) > today) return null;
  if (promo.valid_until && promo.valid_until.slice(0, 10) < today) return null;
  if (promo.max_uses && (promo.used_count ?? 0) >= promo.max_uses) return null;
  return promo;
}
