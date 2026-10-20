import { ForbiddenException } from '@nestjs/common';
import type { PolicyContext } from './policy-context.js';
import type { Where } from './query.js';

/**
 * Who may do what through the generic /entities API. Default deny: anything not listed
 * here is admin-only, and admins can always read and write everything. Money, payouts,
 * subscriptions and wallet balances are never written by clients — the server changes
 * them through the payments, wallet and sessions modules.
 */

type Data = Record<string, unknown>;
export type Access = Where | boolean;

export interface CreateRule {
  /** "public": anyone, "user": logged in */
  who: 'public' | 'user';
  /** Fields only admins (or the server) may set */
  protect?: string[];
  /** Values the server sets regardless of what the client sent */
  force?: (ctx: PolicyContext, data: Data) => Data | Promise<Data>;
  /** Throw ForbiddenException to refuse the record */
  check?: (ctx: PolicyContext, data: Data) => void | Promise<void>;
}

export interface UpdateRule {
  who?: 'public' | 'user';
  /** Rows a non-admin may update */
  rows: (ctx: PolicyContext) => Access | Promise<Access>;
  /** Fields a non-admin may change */
  fields: string[];
  /** Fields that can only go up by one, whatever value is sent (e.g. view counters) */
  counters?: string[];
  /** Allowed values for some of the fields above */
  values?: Record<string, unknown[]>;
}

export interface EntityPolicy {
  /** Rows a non-admin may read (true = all, false = none) */
  read: (ctx: PolicyContext, filter: Data) => Access | Promise<Access>;
  /** Non-admin reads must filter on this field with an exact value */
  requireFilter?: string;
  /** Fields hidden from everyone except admins and `showHidden` */
  hidden?: string[];
  showHidden?: (ctx: PolicyContext, row: Data) => boolean;
  create?: CreateRule;
  update?: UpdateRule;
  remove?: { rows: (ctx: PolicyContext) => Access | Promise<Access> };
}

// ── Helpers ──────────────────────────────────────────────────────────

const none = () => false;
const all = () => true;
const owner = (field: string) => (ctx: PolicyContext): Access => (ctx.email ? { [field]: ctx.email } : false);
const inIds = (field: string, ids: string[]): Access => (ids.length ? { [field]: { in: ids } } : false);

function anyOf(...parts: Access[]): Access {
  if (parts.includes(true)) return true;
  const wheres = parts.filter((p): p is Where => p !== false);
  if (!wheres.length) return false;
  return wheres.length === 1 ? wheres[0] : { OR: wheres };
}

function forbid(message: string): never {
  throw new ForbiddenException(message);
}

const caseAccess = async (ctx: PolicyContext): Promise<Access> => inIds('case_id', await ctx.caseIds());
const asLawyer = async (ctx: PolicyContext, field = 'lawyer_id'): Promise<Access> => inIds(field, await ctx.lawyerIds());

const ADMIN_ONLY: EntityPolicy = { read: none };

const PUBLIC_CONTENT = (published?: Where): EntityPolicy => ({ read: () => published ?? true });

// ── Policies ─────────────────────────────────────────────────────────

export const POLICIES: Record<string, EntityPolicy> = {
  Blog: {
    read: () => ({ is_published: true }),
    // Readers bump the view counter; the server only ever adds one
    update: { who: 'public', rows: () => ({ is_published: true }), fields: [], counters: ['view_count'] },
  },

  Case: {
    read: async (ctx) => anyOf(owner('client_email')(ctx), await asLawyer(ctx, 'assigned_lawyer_id')),
    create: {
      who: 'user',
      protect: ['assigned_lawyer_id', 'assigned_lawyer_name', 'amount_paid', 'fee_agreed'],
      force: (ctx) => ({ client_email: ctx.email, status: 'pending' }),
    },
    update: {
      rows: async (ctx) => anyOf(owner('client_email')(ctx), await asLawyer(ctx, 'assigned_lawyer_id')),
      fields: [
        'title', 'description', 'category', 'court_level', 'status', 'filing_status', 'health_status',
        'limitation_date', 'next_hearing_date', 'notes', 'ai_summary', 'missing_documents', 'tags', 'client_name',
      ],
    },
    remove: { rows: owner('client_email') },
  },

  CaseDocument: {
    read: caseAccess,
    create: {
      who: 'user',
      force: (ctx) => ({ uploaded_by: ctx.email }),
      check: async (ctx, d) => {
        if (!(await ctx.caseIds()).includes(String(d.case_id))) forbid('You can only add documents to your own cases');
      },
    },
    update: { rows: caseAccess, fields: ['name', 'folder', 'version', 'ai_summary', 'description', 'is_certified_copy'] },
  },

  ChatMessage: {
    read: async (ctx) => anyOf(owner('user_email')(ctx), await asLawyer(ctx)),
    create: {
      who: 'user',
      force: (ctx) => ({ sender_email: ctx.email }),
      check: async (ctx, d) => {
        const isClient = d.user_email === ctx.email;
        const isLawyer = (await ctx.lawyerIds()).includes(String(d.lawyer_id));
        if (!isClient && !isLawyer) forbid('You can only send messages in your own conversations');
      },
    },
    update: { rows: async (ctx) => anyOf(owner('user_email')(ctx), await asLawyer(ctx)), fields: ['is_read'] },
  },

  Consultation: {
    read: async (ctx) => anyOf(owner('client_email')(ctx), await asLawyer(ctx)),
    create: {
      who: 'user',
      // The listed price comes from the lawyer's profile, never from the client
      force: async (ctx, d) => {
        const lawyer = await ctx.prisma.lawyer.findUnique({
          where: { id: String(d.lawyer_id ?? '') },
          select: { discounted_rate: true, consultation_rate: true, full_name: true },
        });
        if (!lawyer) forbid('Unknown lawyer');
        return {
          client_email: ctx.email,
          status: 'scheduled',
          lawyer_name: lawyer!.full_name,
          amount_paid: lawyer!.discounted_rate || lawyer!.consultation_rate || 0,
        };
      },
    },
    update: {
      rows: async (ctx) => anyOf(owner('client_email')(ctx), await asLawyer(ctx)),
      fields: ['status', 'notes', 'consultation_type', 'scheduled_date', 'duration_minutes', 'client_name'],
      values: { status: ['scheduled', 'in_progress', 'completed', 'cancelled'] },
    },
  },

  Dispute: {
    read: owner('raised_by_email'),
    create: {
      who: 'user',
      protect: ['admin_notes', 'resolved_by', 'refund_amount'],
      force: (ctx) => ({ raised_by_email: ctx.email, status: 'open' }),
    },
  },

  Escalation: {
    read: async (ctx) => anyOf(owner('client_email')(ctx), await asLawyer(ctx)),
    create: {
      who: 'user',
      protect: ['resolution_notes', 'resolved_by'],
      force: (ctx) => ({ client_email: ctx.email, status: 'open' }),
    },
  },

  FleetOwner: { read: owner('user_email') },

  FleetVehicle: {
    read: owner('owner_email'),
    create: {
      who: 'user',
      force: (ctx) => ({ owner_email: ctx.email }),
      check: async (ctx, d) => {
        if (d.fleet_owner_id && !(await ctx.fleetOwnerIds()).includes(String(d.fleet_owner_id))) forbid('Not your fleet');
      },
    },
    update: {
      rows: owner('owner_email'),
      fields: [
        'vehicle_number', 'vehicle_type', 'make_model', 'year', 'rc_expiry', 'puc_expiry', 'fitness_expiry',
        'insurance_expiry', 'permit_expiry', 'assigned_driver_id', 'assigned_driver_name', 'notes', 'is_active',
      ],
    },
    remove: { rows: owner('owner_email') },
  },

  FleetDriver: {
    read: owner('owner_email'),
    create: {
      who: 'user',
      force: (ctx) => ({ owner_email: ctx.email }),
      check: async (ctx, d) => {
        if (d.fleet_owner_id && !(await ctx.fleetOwnerIds()).includes(String(d.fleet_owner_id))) forbid('Not your fleet');
      },
    },
    update: {
      rows: owner('owner_email'),
      fields: [
        'name', 'phone', 'email', 'dl_number', 'dl_expiry', 'address', 'emergency_contact', 'assigned_vehicle_id',
        'assigned_vehicle_number', 'status', 'notes',
      ],
    },
    remove: { rows: owner('owner_email') },
  },

  FleetInvoice: { read: owner('owner_email') },

  Hearing: {
    read: caseAccess,
    create: {
      who: 'user',
      check: async (ctx, d) => {
        if (!(await ctx.caseIds()).includes(String(d.case_id))) forbid('You can only add hearings to your own cases');
      },
    },
    update: {
      rows: caseAccess,
      fields: ['hearing_date', 'court_name', 'judge_name', 'outcome', 'next_date', 'status', 'order_uploaded', 'order_url', 'notes', 'compliance_deadline'],
    },
  },

  HeroBanner: PUBLIC_CONTENT(),
  JobOpening: PUBLIC_CONTENT({ is_active: true }),
  LegalService: PUBLIC_CONTENT(),

  // Codes are checked one at a time; nobody but admins can list them
  PromoCode: { read: all, requireFilter: 'code' },

  JobApplication: {
    read: owner('applicant_email'),
    create: {
      who: 'public',
      protect: ['admin_notes', 'interview_date', 'reviewed_by', 'reject_reason'],
      force: () => ({ status: 'applied' }),
    },
  },

  Lawyer: {
    read: all,
    // Bank details and ID documents: only the lawyer and admins
    hidden: ['account_holder', 'account_number', 'ifsc_code', 'bank_name', 'upi_id', 'bar_council_id_url'],
    showHidden: (ctx, row) => !!ctx.email && row.email === ctx.email,
    update: {
      rows: owner('email'),
      fields: [
        'phone', 'city', 'state', 'photo_url', 'court_of_practice', 'primary_jurisdiction', 'years_of_practice',
        'consultation_rate', 'chat_rate', 'audio_rate', 'video_rate', 'discounted_rate', 'offer_label',
        'specializations', 'languages', 'bio', 'is_online', 'is_on_call', 'chat_enabled', 'audio_enabled',
        'video_enabled', 'account_holder', 'account_number', 'ifsc_code', 'bank_name', 'upi_id',
      ],
    },
  },

  LawyerApplication: {
    read: owner('email'),
    create: { who: 'public', force: () => ({ status: 'pending' }) },
  },

  Message: {
    read: caseAccess,
    create: {
      who: 'user',
      protect: ['is_internal', 'ai_suggested'],
      force: (ctx) => ({ sender_email: ctx.email }),
      check: async (ctx, d) => {
        if (!(await ctx.caseIds()).includes(String(d.case_id))) forbid('You can only message on your own cases');
      },
    },
  },

  RGLAdvocate: {
    read: owner('lawyer_email'),
    create: {
      who: 'user',
      protect: ['strike_count', 'monthly_earnings', 'total_cases', 'rating', 'joining_date', 'is_active'],
      force: (ctx) => ({ lawyer_email: ctx.email, status: 'pending' }),
    },
    update: {
      rows: owner('lawyer_email'),
      fields: [
        'is_online', 'zone_lat', 'zone_lng', 'zone_radius_km', 'zone_name', 'territory_points', 'shift_preference',
        'phone', 'specializations', 'other_specialization', 'description',
      ],
    },
  },

  RGLCase: {
    read: async (ctx) => anyOf(owner('client_email')(ctx), inIds('assigned_advocate_id', await ctx.rglAdvocateIds())),
    update: {
      rows: async (ctx) => inIds('assigned_advocate_id', await ctx.rglAdvocateIds()),
      fields: ['status', 'incident_lat', 'incident_lng', 'notes', 'm1_completed_at', 'm2_completed_at', 'm3_completed_at', 'response_time_minutes'],
    },
  },

  RGLReferral: {
    // Anyone may look up a code (to apply it at checkout); balances stay private
    read: (ctx, filter) => (typeof filter.referral_code === 'string' ? true : owner('user_email')(ctx)),
    hidden: ['available_balance', 'total_earned', 'total_withdrawn', 'total_referrals'],
    showHidden: (ctx, row) => !!ctx.email && row.user_email === ctx.email,
    create: {
      who: 'user',
      force: (ctx) => ({
        user_email: ctx.email,
        is_active: true,
        total_referrals: 0,
        total_earned: 0,
        available_balance: 0,
        total_withdrawn: 0,
      }),
      check: async (ctx, d) => {
        if (typeof d.referral_code !== 'string' || !/^[A-Z0-9-]{4,24}$/i.test(d.referral_code)) forbid('Invalid referral code');
        if (await ctx.prisma.rGLReferral.findFirst({ where: { user_email: ctx.email } })) forbid('You already have a referral code');
        if (await ctx.prisma.rGLReferral.findFirst({ where: { referral_code: d.referral_code } })) forbid('Referral code taken');
      },
    },
    update: { rows: owner('user_email'), fields: ['user_name', 'description'] },
  },

  RGLSubscription: {
    read: (ctx) => anyOf(owner('buyer_email')(ctx), owner('referrer_email')(ctx)),
    update: { rows: owner('buyer_email'), fields: ['auto_renewal'] },
  },

  RGLWithdrawal: { read: owner('referrer_email') },

  ServiceCase: { read: owner('client_email') },

  ServiceRequest: {
    read: owner('client_email'),
    create: {
      who: 'user',
      protect: ['assigned_lawyer_id', 'assigned_lawyer_name', 'price_quoted'],
      // Paid status and amount are set when the payment is verified
      force: (ctx) => ({
        client_email: ctx.email,
        payment_status: 'pending',
        amount_paid: 0,
        status: 'pending',
        doc_upload_status: 'pending',
      }),
    },
    update: {
      rows: owner('client_email'),
      fields: ['documents', 'doc_upload_status', 'status', 'description', 'notes', 'client_name', 'client_phone'],
      values: { status: ['pending', 'in_review', 'cancelled'], doc_upload_status: ['pending', 'uploaded'] },
    },
    remove: { rows: (ctx) => (ctx.email ? { client_email: ctx.email, payment_status: { not: 'paid' } } : false) },
  },

  Session: { read: owner('user_email') },

  User: {
    read: (ctx) => (ctx.user ? { id: ctx.user.id } : false),
    hidden: ['google_sub', 'data', 'disabled'],
  },

  Wallet: { read: owner('user_email') },
  WalletTransaction: { read: owner('user_email') },

  WithdrawalRequest: {
    read: owner('lawyer_email'),
    create: {
      who: 'user',
      protect: ['admin_notes', 'processed_by', 'processed_at', 'transaction_ref'],
      force: (ctx) => ({ lawyer_email: ctx.email, status: 'pending' }),
      // Lawyers can request up to their wallet balance minus requests still open
      check: async (ctx, d) => {
        const lawyerIds = await ctx.lawyerIds();
        if (!lawyerIds.length || !lawyerIds.includes(String(d.lawyer_id))) forbid('Only advocates can request payouts');
        const amount = Number(d.amount);
        if (!Number.isFinite(amount) || amount <= 0) forbid('Invalid amount');
        const wallet = await ctx.prisma.wallet.findFirst({ where: { user_email: ctx.email } });
        const open = await ctx.prisma.withdrawalRequest.aggregate({
          where: { lawyer_email: ctx.email, status: { in: ['pending', 'approved'] } },
          _sum: { amount: true },
        });
        if (amount > (wallet?.balance ?? 0) - (open._sum.amount ?? 0)) forbid('Amount is more than your available balance');
      },
    },
  },

  // Legal-practice tables that nothing in the app uses yet
  LGBeneficiary: ADMIN_ONLY,
  LGCase: ADMIN_ONLY,
  LGClient: ADMIN_ONLY,
  LGCompliance: ADMIN_ONLY,
  LGDocument: ADMIN_ONLY,
  LGHearing: ADMIN_ONLY,
  LGInvoice: ADMIN_ONLY,
  LGTask: ADMIN_ONLY,
  LGTransaction: ADMIN_ONLY,
};
