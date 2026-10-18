-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "phone" TEXT,
    "city" TEXT,
    "notifications_enabled" BOOLEAN,
    "avatar_url" TEXT,
    "google_sub" TEXT,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(3),
    "data" JSONB,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMPTZ(3),
    "ip" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,
    "ip" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "user_email" TEXT,
    "purpose" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'created',
    "meta" JSONB,
    "cf_payment_id" TEXT,
    "payment_method" TEXT,
    "paid_at" TIMESTAMPTZ(3),
    "fulfilled_at" TIMESTAMPTZ(3),
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "agent_name" TEXT NOT NULL,
    "user_email" TEXT,
    "metadata" JSONB,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_uploads" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "content_type" TEXT,
    "size" INTEGER,
    "uploaded_by" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogs" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "title" TEXT,
    "slug" TEXT,
    "category" TEXT,
    "excerpt" TEXT,
    "content" TEXT,
    "cover_image" TEXT,
    "author_name" TEXT,
    "tags" JSONB,
    "is_published" BOOLEAN DEFAULT false,
    "is_featured" BOOLEAN DEFAULT false,
    "read_time_minutes" DOUBLE PRECISION,
    "meta_description" TEXT,
    "meta_keywords" TEXT,
    "geo_city" TEXT,
    "geo_state" TEXT,
    "geo_country" TEXT DEFAULT 'India',
    "geo_region" TEXT,
    "focus_keyword" TEXT,
    "view_count" DOUBLE PRECISION DEFAULT 0,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "blogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "client_email" TEXT,
    "client_name" TEXT,
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "court_level" TEXT,
    "status" TEXT DEFAULT 'pending',
    "filing_status" TEXT,
    "health_status" TEXT DEFAULT 'green',
    "limitation_date" TEXT,
    "next_hearing_date" TEXT,
    "assigned_lawyer_id" TEXT,
    "assigned_lawyer_name" TEXT,
    "amount_paid" DOUBLE PRECISION,
    "fee_agreed" DOUBLE PRECISION,
    "notes" TEXT,
    "ai_summary" TEXT,
    "missing_documents" JSONB,
    "tags" JSONB,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "name" TEXT,
    "folder" TEXT,
    "version" TEXT,
    "file_url" TEXT,
    "ai_summary" TEXT,
    "uploaded_by" TEXT,
    "is_certified_copy" BOOLEAN DEFAULT false,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "conversation_id" TEXT,
    "sender_email" TEXT,
    "sender_name" TEXT,
    "sender_role" TEXT,
    "content" TEXT,
    "file_url" TEXT,
    "file_name" TEXT,
    "file_type" TEXT,
    "is_read" BOOLEAN DEFAULT false,
    "lawyer_id" TEXT,
    "user_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "client_email" TEXT,
    "client_name" TEXT,
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "status" TEXT DEFAULT 'scheduled',
    "scheduled_date" TEXT,
    "duration_minutes" DOUBLE PRECISION,
    "amount_paid" DOUBLE PRECISION,
    "notes" TEXT,
    "consultation_type" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "raised_by_email" TEXT,
    "raised_by_name" TEXT,
    "raised_by_role" TEXT,
    "type" TEXT,
    "amount" DOUBLE PRECISION,
    "description" TEXT,
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "consultation_id" TEXT,
    "status" TEXT DEFAULT 'open',
    "admin_notes" TEXT,
    "resolved_by" TEXT,
    "refund_amount" DOUBLE PRECISION,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "client_email" TEXT,
    "client_name" TEXT,
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "type" TEXT,
    "description" TEXT,
    "level" TEXT DEFAULT 'level_1',
    "status" TEXT DEFAULT 'open',
    "resolution_notes" TEXT,
    "resolved_by" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_drivers" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "fleet_owner_id" TEXT,
    "owner_email" TEXT,
    "policy_number" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "dl_number" TEXT,
    "dl_expiry" TEXT,
    "address" TEXT,
    "emergency_contact" TEXT,
    "assigned_vehicle_id" TEXT,
    "assigned_vehicle_number" TEXT,
    "status" TEXT DEFAULT 'active',
    "notes" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "fleet_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_invoices" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "invoice_number" TEXT,
    "policy_number" TEXT,
    "fleet_owner_id" TEXT,
    "owner_name" TEXT,
    "owner_email" TEXT,
    "owner_phone" TEXT,
    "company_name" TEXT,
    "plan" TEXT,
    "vehicle_count" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "gst_amount" DOUBLE PRECISION,
    "total_amount" DOUBLE PRECISION,
    "transaction_id" TEXT,
    "payment_method" TEXT,
    "payment_date" TEXT,
    "subscription_start" TEXT,
    "subscription_end" TEXT,
    "status" TEXT DEFAULT 'paid',
    "pdf_url" TEXT,
    "email_sent" BOOLEAN DEFAULT false,
    "notes" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "fleet_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_owners" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_email" TEXT,
    "owner_name" TEXT,
    "policy_number" TEXT,
    "company_name" TEXT,
    "phone" TEXT,
    "gst_number" TEXT,
    "address" TEXT,
    "fleet_size" DOUBLE PRECISION,
    "vehicle_type" TEXT,
    "plan" TEXT DEFAULT 'starter',
    "service_type" TEXT DEFAULT 'pan_india',
    "status" TEXT DEFAULT 'active',
    "policy_start" TEXT,
    "policy_end" TEXT,
    "subscription_start" TEXT,
    "subscription_end" TEXT,
    "last_invoice_id" TEXT,
    "assigned_by_admin" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "fleet_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fleet_vehicles" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "fleet_owner_id" TEXT,
    "owner_email" TEXT,
    "policy_number" TEXT,
    "vehicle_number" TEXT,
    "vehicle_type" TEXT,
    "make_model" TEXT,
    "year" DOUBLE PRECISION,
    "rc_expiry" TEXT,
    "puc_expiry" TEXT,
    "fitness_expiry" TEXT,
    "insurance_expiry" TEXT,
    "permit_expiry" TEXT,
    "assigned_driver_id" TEXT,
    "assigned_driver_name" TEXT,
    "legal_status" TEXT DEFAULT 'clear',
    "active_case_id" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "fleet_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hearings" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "hearing_date" TEXT,
    "court_name" TEXT,
    "judge_name" TEXT,
    "outcome" TEXT,
    "next_date" TEXT,
    "status" TEXT DEFAULT 'upcoming',
    "order_uploaded" BOOLEAN DEFAULT false,
    "order_url" TEXT,
    "notes" TEXT,
    "compliance_deadline" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hero_banners" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "title" TEXT,
    "subtitle" TEXT,
    "image_url" TEXT,
    "cta_label" TEXT,
    "cta_link" TEXT,
    "order" DOUBLE PRECISION,
    "is_active" BOOLEAN DEFAULT true,
    "is_fixed" BOOLEAN DEFAULT false,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "hero_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "job_id" TEXT,
    "job_title" TEXT,
    "applicant_name" TEXT,
    "applicant_email" TEXT,
    "applicant_phone" TEXT,
    "resume_url" TEXT,
    "cover_letter" TEXT,
    "custom_answers" JSONB,
    "status" TEXT DEFAULT 'applied',
    "admin_notes" TEXT,
    "interview_date" TEXT,
    "reviewed_by" TEXT,
    "reject_reason" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_openings" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "title" TEXT,
    "department" TEXT,
    "location" TEXT,
    "type" TEXT DEFAULT 'full_time',
    "description" TEXT,
    "requirements" TEXT,
    "salary_range" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "custom_fields" JSONB,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_beneficiaries" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "name" TEXT,
    "category" TEXT DEFAULT 'General',
    "issue_type" TEXT DEFAULT 'Other',
    "mobile" TEXT,
    "address" TEXT,
    "intake_date" TEXT,
    "referred_by" TEXT DEFAULT 'Walk-in',
    "case_id" TEXT,
    "services_provided" JSONB,
    "case_officer" TEXT,
    "status" TEXT DEFAULT 'Active',
    "outcome" TEXT,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_beneficiaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_cases" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "case_title" TEXT,
    "case_number" TEXT,
    "cnr_number" TEXT,
    "case_type" TEXT,
    "sub_type" TEXT,
    "court_tribunal" TEXT,
    "court_location" TEXT,
    "bench_court_no" TEXT,
    "presiding_judge" TEXT,
    "filing_date" TEXT,
    "registration_date" TEXT,
    "our_side" TEXT,
    "priority" TEXT DEFAULT 'Medium',
    "case_tags" JSONB,
    "assigned_to" TEXT,
    "assigned_to_name" TEXT,
    "team_members" JSONB,
    "description" TEXT,
    "is_ngo_case" BOOLEAN DEFAULT false,
    "client_id" TEXT,
    "client_name" TEXT,
    "opposing_party" TEXT,
    "opposing_counsel" TEXT,
    "opposing_counsel_mobile" TEXT,
    "overall_status" TEXT DEFAULT 'Active',
    "current_stage" TEXT DEFAULT 'Filing',
    "next_hearing_date" TEXT,
    "next_hearing_purpose" TEXT,
    "expected_resolution" TEXT,
    "outcome" TEXT DEFAULT 'Pending',
    "outcome_date" TEXT,
    "outcome_notes" TEXT,
    "total_agreed_fee" DOUBLE PRECISION DEFAULT 0,
    "total_billed" DOUBLE PRECISION DEFAULT 0,
    "total_received" DOUBLE PRECISION DEFAULT 0,
    "total_pending" DOUBLE PRECISION DEFAULT 0,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_clients" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "client_name" TEXT,
    "client_type" TEXT DEFAULT 'Individual',
    "mobile" TEXT,
    "email" TEXT,
    "address" TEXT,
    "aadhar_pan" TEXT,
    "referred_by" TEXT,
    "category" TEXT DEFAULT 'Regular Client',
    "total_billed" DOUBLE PRECISION DEFAULT 0,
    "total_received" DOUBLE PRECISION DEFAULT 0,
    "total_outstanding" DOUBLE PRECISION DEFAULT 0,
    "client_since" TEXT,
    "notes" TEXT,
    "portal_access" BOOLEAN DEFAULT false,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_compliances" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "item_name" TEXT,
    "compliance_type" TEXT DEFAULT 'Other',
    "due_date" TEXT,
    "frequency" TEXT DEFAULT 'Annual',
    "governing_authority" TEXT,
    "alert_days_before" DOUBLE PRECISION DEFAULT 30,
    "status" TEXT DEFAULT 'Pending',
    "completed_date" TEXT,
    "notes" TEXT,
    "attachment_url" TEXT,
    "managed_by" TEXT,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_compliances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_documents" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "doc_name" TEXT,
    "doc_type" TEXT DEFAULT 'Other',
    "case_id" TEXT,
    "case_title" TEXT,
    "hearing_id" TEXT,
    "filed_by" TEXT,
    "doc_date" TEXT,
    "file_url" TEXT,
    "version" TEXT DEFAULT 'v1',
    "confidentiality" TEXT DEFAULT 'Internal Only',
    "notes" TEXT,
    "expiry_date" TEXT,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_hearings" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "case_title" TEXT,
    "hearing_date" TEXT,
    "hearing_time" TEXT,
    "purpose" TEXT,
    "court_board" TEXT,
    "appearance_by" TEXT,
    "what_happened" TEXT,
    "orders_passed" TEXT,
    "next_date" TEXT,
    "next_date_purpose" TEXT,
    "adjournment_reason" TEXT,
    "documents_filed" TEXT,
    "fee_charged" DOUBLE PRECISION DEFAULT 0,
    "reminder_sent" BOOLEAN DEFAULT false,
    "status" TEXT DEFAULT 'Upcoming',
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_hearings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_invoices" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "invoice_no" TEXT,
    "case_id" TEXT,
    "case_title" TEXT,
    "client_id" TEXT,
    "client_name" TEXT,
    "invoice_date" TEXT,
    "due_date" TEXT,
    "items" JSONB,
    "subtotal" DOUBLE PRECISION DEFAULT 0,
    "gst_percent" DOUBLE PRECISION DEFAULT 0,
    "gst_amount" DOUBLE PRECISION DEFAULT 0,
    "total_amount" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT DEFAULT 'Draft',
    "paid_amount" DOUBLE PRECISION DEFAULT 0,
    "notes" TEXT,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_tasks" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "task_title" TEXT,
    "case_id" TEXT,
    "case_title" TEXT,
    "assigned_to" TEXT,
    "assigned_to_name" TEXT,
    "due_date" TEXT,
    "priority" TEXT DEFAULT 'Normal',
    "status" TEXT DEFAULT 'Pending',
    "description" TEXT,
    "checklist" JSONB,
    "attachments" JSONB,
    "completed_on" TEXT,
    "notes" TEXT,
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lg_transactions" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "case_title" TEXT,
    "client_id" TEXT,
    "client_name" TEXT,
    "txn_date" TEXT,
    "amount" DOUBLE PRECISION,
    "mode" TEXT DEFAULT 'Cash',
    "reference_no" TEXT,
    "received_by" TEXT,
    "receipt_no" TEXT,
    "purpose" TEXT DEFAULT 'Hearing Fee',
    "notes" TEXT,
    "attachment_url" TEXT,
    "type" TEXT DEFAULT 'Income',
    "owner_email" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lg_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyers" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "full_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "photo_url" TEXT,
    "bar_association" TEXT,
    "bar_council_number" TEXT,
    "primary_jurisdiction" TEXT,
    "years_of_practice" DOUBLE PRECISION,
    "court_of_practice" TEXT,
    "consultation_rate" DOUBLE PRECISION,
    "chat_rate" DOUBLE PRECISION,
    "audio_rate" DOUBLE PRECISION,
    "video_rate" DOUBLE PRECISION,
    "discounted_rate" DOUBLE PRECISION,
    "offer_label" TEXT,
    "specializations" JSONB,
    "languages" JSONB,
    "bio" TEXT,
    "rating" DOUBLE PRECISION,
    "total_reviews" DOUBLE PRECISION,
    "total_consultations" DOUBLE PRECISION DEFAULT 0,
    "is_online" BOOLEAN,
    "is_on_call" BOOLEAN DEFAULT false,
    "is_verified" BOOLEAN,
    "is_top_rated" BOOLEAN,
    "status" TEXT DEFAULT 'pending',
    "bar_council_id_url" TEXT,
    "chat_enabled" BOOLEAN DEFAULT true,
    "audio_enabled" BOOLEAN DEFAULT true,
    "video_enabled" BOOLEAN DEFAULT true,
    "account_holder" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "bank_name" TEXT,
    "upi_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lawyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lawyer_applications" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "full_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "bar_association" TEXT,
    "bar_council_number" TEXT,
    "primary_jurisdiction" TEXT,
    "years_of_practice" TEXT,
    "court_of_practice" TEXT,
    "consultation_rate" DOUBLE PRECISION,
    "specializations" JSONB,
    "languages" JSONB,
    "photo_url" TEXT,
    "bar_council_id_url" TEXT,
    "reason" TEXT,
    "status" TEXT DEFAULT 'pending',
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "lawyer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_services" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "title" TEXT,
    "description" TEXT,
    "category" TEXT,
    "price" DOUBLE PRECISION,
    "delivery_days" DOUBLE PRECISION,
    "is_popular" BOOLEAN,
    "is_active" BOOLEAN DEFAULT true,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "legal_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_id" TEXT,
    "sender_email" TEXT,
    "sender_name" TEXT,
    "sender_role" TEXT,
    "content" TEXT,
    "is_internal" BOOLEAN DEFAULT false,
    "ai_suggested" BOOLEAN DEFAULT false,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "code" TEXT,
    "description" TEXT,
    "type" TEXT,
    "value" DOUBLE PRECISION,
    "use_case" TEXT,
    "max_uses" DOUBLE PRECISION,
    "used_count" DOUBLE PRECISION DEFAULT 0,
    "valid_from" TEXT,
    "valid_until" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "applicable_for" TEXT DEFAULT 'all',
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgl_advocates" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "lawyer_email" TEXT,
    "phone" TEXT,
    "zone_name" TEXT,
    "zone_radius_km" DOUBLE PRECISION DEFAULT 30,
    "zone_lat" DOUBLE PRECISION,
    "zone_lng" DOUBLE PRECISION,
    "territory_points" JSONB,
    "shift_preference" TEXT DEFAULT 'both',
    "specializations" JSONB,
    "other_specialization" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "is_online" BOOLEAN DEFAULT false,
    "strike_count" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT DEFAULT 'pending',
    "monthly_earnings" DOUBLE PRECISION DEFAULT 0,
    "total_cases" DOUBLE PRECISION DEFAULT 0,
    "rating" DOUBLE PRECISION,
    "bar_council_number" TEXT,
    "joining_date" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "rgl_advocates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgl_cases" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "case_number" TEXT,
    "client_name" TEXT,
    "client_phone" TEXT,
    "client_email" TEXT,
    "incident_location" TEXT,
    "incident_lat" DOUBLE PRECISION,
    "incident_lng" DOUBLE PRECISION,
    "police_station" TEXT,
    "case_type" TEXT,
    "vehicle_type" TEXT,
    "vehicle_number" TEXT,
    "assigned_advocate_id" TEXT,
    "assigned_advocate_name" TEXT,
    "status" TEXT DEFAULT 'unassigned',
    "m1_fee" DOUBLE PRECISION,
    "m2_fee" DOUBLE PRECISION,
    "m3_fee" DOUBLE PRECISION,
    "m1_completed_at" TEXT,
    "m2_completed_at" TEXT,
    "m3_completed_at" TEXT,
    "shift" TEXT,
    "notes" TEXT,
    "dispatch_time" TEXT,
    "response_time_minutes" DOUBLE PRECISION,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "rgl_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgl_referrals" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_email" TEXT,
    "user_name" TEXT,
    "referral_code" TEXT,
    "is_active" BOOLEAN DEFAULT true,
    "total_referrals" DOUBLE PRECISION DEFAULT 0,
    "total_earned" DOUBLE PRECISION DEFAULT 0,
    "available_balance" DOUBLE PRECISION DEFAULT 0,
    "total_withdrawn" DOUBLE PRECISION DEFAULT 0,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "rgl_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgl_subscriptions" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "policy_number" TEXT,
    "buyer_name" TEXT,
    "buyer_email" TEXT,
    "buyer_phone" TEXT,
    "fleet_size" DOUBLE PRECISION,
    "vehicle_type" TEXT,
    "city" TEXT,
    "plan_name" TEXT,
    "plan_type" TEXT,
    "amount_paid" DOUBLE PRECISION,
    "discount_amount" DOUBLE PRECISION DEFAULT 0,
    "referral_code_used" TEXT,
    "referrer_email" TEXT,
    "referral_commission" DOUBLE PRECISION DEFAULT 0,
    "txn_id" TEXT,
    "payment_date" TEXT,
    "activation_date" TEXT,
    "expiry_date" TEXT,
    "auto_renewal" BOOLEAN DEFAULT true,
    "status" TEXT DEFAULT 'active',
    "invoice_url" TEXT,
    "notes" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "rgl_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgl_withdrawals" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "referrer_email" TEXT,
    "referrer_name" TEXT,
    "referral_code" TEXT,
    "amount" DOUBLE PRECISION,
    "account_holder" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "bank_name" TEXT,
    "upi_id" TEXT,
    "status" TEXT DEFAULT 'pending',
    "admin_notes" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "rgl_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_cases" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "client_email" TEXT,
    "client_name" TEXT,
    "service_id" TEXT,
    "service_title" TEXT,
    "status" TEXT DEFAULT 'pending',
    "amount_paid" DOUBLE PRECISION,
    "assigned_lawyer_id" TEXT,
    "assigned_lawyer_name" TEXT,
    "documents" JSONB,
    "notes" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "service_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "client_email" TEXT,
    "client_name" TEXT,
    "client_phone" TEXT,
    "service_id" TEXT,
    "service_title" TEXT,
    "category" TEXT,
    "package_name" TEXT,
    "package_price" TEXT,
    "amount_paid" DOUBLE PRECISION,
    "service_request_no" TEXT,
    "payment_order_id" TEXT,
    "payment_status" TEXT DEFAULT 'pending',
    "description" TEXT,
    "documents" JSONB,
    "doc_upload_status" TEXT DEFAULT 'pending',
    "status" TEXT DEFAULT 'pending',
    "assigned_lawyer_id" TEXT,
    "assigned_lawyer_name" TEXT,
    "notes" TEXT,
    "price_quoted" DOUBLE PRECISION,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_email" TEXT,
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "consultation_id" TEXT,
    "session_type" TEXT,
    "status" TEXT DEFAULT 'active',
    "rate_per_min" DOUBLE PRECISION,
    "started_at" TEXT,
    "ended_at" TEXT,
    "duration_minutes" DOUBLE PRECISION DEFAULT 0,
    "total_charged" DOUBLE PRECISION DEFAULT 0,
    "last_tick_at" TEXT,
    "idempotency_key" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_email" TEXT,
    "balance" DOUBLE PRECISION DEFAULT 0,
    "bonus_balance" DOUBLE PRECISION DEFAULT 0,
    "total_recharged" DOUBLE PRECISION DEFAULT 0,
    "total_spent" DOUBLE PRECISION DEFAULT 0,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "user_email" TEXT,
    "type" TEXT,
    "amount" DOUBLE PRECISION,
    "gst" DOUBLE PRECISION DEFAULT 0,
    "net_amount" DOUBLE PRECISION,
    "description" TEXT,
    "lawyer_name" TEXT,
    "consultation_id" TEXT,
    "duration_minutes" DOUBLE PRECISION,
    "rate_per_min" DOUBLE PRECISION,
    "status" TEXT DEFAULT 'completed',
    "payment_method" TEXT,
    "reference_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL DEFAULT substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 24),
    "lawyer_id" TEXT,
    "lawyer_name" TEXT,
    "lawyer_email" TEXT,
    "amount" DOUBLE PRECISION,
    "method" TEXT,
    "upi_id" TEXT,
    "account_holder" TEXT,
    "account_number" TEXT,
    "ifsc_code" TEXT,
    "bank_name" TEXT,
    "status" TEXT DEFAULT 'pending',
    "admin_notes" TEXT,
    "processed_by" TEXT,
    "processed_at" TEXT,
    "transaction_ref" TEXT,
    "description" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,
    "created_by_id" TEXT,

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- CreateIndex
CREATE INDEX "otp_codes_email_created_date_idx" ON "otp_codes"("email", "created_date");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "payment_orders_user_email_idx" ON "payment_orders"("user_email");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "agent_conversations_user_email_idx" ON "agent_conversations"("user_email");

-- CreateIndex
CREATE UNIQUE INDEX "file_uploads_key_key" ON "file_uploads"("key");

-- CreateIndex
CREATE INDEX "blogs_slug_idx" ON "blogs"("slug");

-- CreateIndex
CREATE INDEX "blogs_created_date_idx" ON "blogs"("created_date");

-- CreateIndex
CREATE INDEX "cases_case_id_idx" ON "cases"("case_id");

-- CreateIndex
CREATE INDEX "cases_client_email_idx" ON "cases"("client_email");

-- CreateIndex
CREATE INDEX "cases_status_idx" ON "cases"("status");

-- CreateIndex
CREATE INDEX "cases_assigned_lawyer_id_idx" ON "cases"("assigned_lawyer_id");

-- CreateIndex
CREATE INDEX "cases_created_date_idx" ON "cases"("created_date");

-- CreateIndex
CREATE INDEX "case_documents_case_id_idx" ON "case_documents"("case_id");

-- CreateIndex
CREATE INDEX "case_documents_created_date_idx" ON "case_documents"("created_date");

-- CreateIndex
CREATE INDEX "chat_messages_sender_email_idx" ON "chat_messages"("sender_email");

-- CreateIndex
CREATE INDEX "chat_messages_lawyer_id_idx" ON "chat_messages"("lawyer_id");

-- CreateIndex
CREATE INDEX "chat_messages_user_email_idx" ON "chat_messages"("user_email");

-- CreateIndex
CREATE INDEX "chat_messages_created_date_idx" ON "chat_messages"("created_date");

-- CreateIndex
CREATE INDEX "consultations_client_email_idx" ON "consultations"("client_email");

-- CreateIndex
CREATE INDEX "consultations_lawyer_id_idx" ON "consultations"("lawyer_id");

-- CreateIndex
CREATE INDEX "consultations_status_idx" ON "consultations"("status");

-- CreateIndex
CREATE INDEX "consultations_created_date_idx" ON "consultations"("created_date");

-- CreateIndex
CREATE INDEX "disputes_raised_by_email_idx" ON "disputes"("raised_by_email");

-- CreateIndex
CREATE INDEX "disputes_lawyer_id_idx" ON "disputes"("lawyer_id");

-- CreateIndex
CREATE INDEX "disputes_consultation_id_idx" ON "disputes"("consultation_id");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_created_date_idx" ON "disputes"("created_date");

-- CreateIndex
CREATE INDEX "escalations_case_id_idx" ON "escalations"("case_id");

-- CreateIndex
CREATE INDEX "escalations_client_email_idx" ON "escalations"("client_email");

-- CreateIndex
CREATE INDEX "escalations_lawyer_id_idx" ON "escalations"("lawyer_id");

-- CreateIndex
CREATE INDEX "escalations_status_idx" ON "escalations"("status");

-- CreateIndex
CREATE INDEX "escalations_created_date_idx" ON "escalations"("created_date");

-- CreateIndex
CREATE INDEX "fleet_drivers_fleet_owner_id_idx" ON "fleet_drivers"("fleet_owner_id");

-- CreateIndex
CREATE INDEX "fleet_drivers_owner_email_idx" ON "fleet_drivers"("owner_email");

-- CreateIndex
CREATE INDEX "fleet_drivers_policy_number_idx" ON "fleet_drivers"("policy_number");

-- CreateIndex
CREATE INDEX "fleet_drivers_email_idx" ON "fleet_drivers"("email");

-- CreateIndex
CREATE INDEX "fleet_drivers_status_idx" ON "fleet_drivers"("status");

-- CreateIndex
CREATE INDEX "fleet_drivers_created_date_idx" ON "fleet_drivers"("created_date");

-- CreateIndex
CREATE INDEX "fleet_invoices_policy_number_idx" ON "fleet_invoices"("policy_number");

-- CreateIndex
CREATE INDEX "fleet_invoices_fleet_owner_id_idx" ON "fleet_invoices"("fleet_owner_id");

-- CreateIndex
CREATE INDEX "fleet_invoices_owner_email_idx" ON "fleet_invoices"("owner_email");

-- CreateIndex
CREATE INDEX "fleet_invoices_status_idx" ON "fleet_invoices"("status");

-- CreateIndex
CREATE INDEX "fleet_invoices_created_date_idx" ON "fleet_invoices"("created_date");

-- CreateIndex
CREATE INDEX "fleet_owners_user_email_idx" ON "fleet_owners"("user_email");

-- CreateIndex
CREATE INDEX "fleet_owners_policy_number_idx" ON "fleet_owners"("policy_number");

-- CreateIndex
CREATE INDEX "fleet_owners_status_idx" ON "fleet_owners"("status");

-- CreateIndex
CREATE INDEX "fleet_owners_created_date_idx" ON "fleet_owners"("created_date");

-- CreateIndex
CREATE INDEX "fleet_vehicles_fleet_owner_id_idx" ON "fleet_vehicles"("fleet_owner_id");

-- CreateIndex
CREATE INDEX "fleet_vehicles_owner_email_idx" ON "fleet_vehicles"("owner_email");

-- CreateIndex
CREATE INDEX "fleet_vehicles_policy_number_idx" ON "fleet_vehicles"("policy_number");

-- CreateIndex
CREATE INDEX "fleet_vehicles_created_date_idx" ON "fleet_vehicles"("created_date");

-- CreateIndex
CREATE INDEX "hearings_case_id_idx" ON "hearings"("case_id");

-- CreateIndex
CREATE INDEX "hearings_status_idx" ON "hearings"("status");

-- CreateIndex
CREATE INDEX "hearings_created_date_idx" ON "hearings"("created_date");

-- CreateIndex
CREATE INDEX "hero_banners_created_date_idx" ON "hero_banners"("created_date");

-- CreateIndex
CREATE INDEX "job_applications_applicant_email_idx" ON "job_applications"("applicant_email");

-- CreateIndex
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");

-- CreateIndex
CREATE INDEX "job_applications_created_date_idx" ON "job_applications"("created_date");

-- CreateIndex
CREATE INDEX "job_openings_created_date_idx" ON "job_openings"("created_date");

-- CreateIndex
CREATE INDEX "lg_beneficiaries_case_id_idx" ON "lg_beneficiaries"("case_id");

-- CreateIndex
CREATE INDEX "lg_beneficiaries_status_idx" ON "lg_beneficiaries"("status");

-- CreateIndex
CREATE INDEX "lg_beneficiaries_owner_email_idx" ON "lg_beneficiaries"("owner_email");

-- CreateIndex
CREATE INDEX "lg_beneficiaries_created_date_idx" ON "lg_beneficiaries"("created_date");

-- CreateIndex
CREATE INDEX "lg_cases_case_id_idx" ON "lg_cases"("case_id");

-- CreateIndex
CREATE INDEX "lg_cases_client_id_idx" ON "lg_cases"("client_id");

-- CreateIndex
CREATE INDEX "lg_cases_owner_email_idx" ON "lg_cases"("owner_email");

-- CreateIndex
CREATE INDEX "lg_cases_created_date_idx" ON "lg_cases"("created_date");

-- CreateIndex
CREATE INDEX "lg_clients_email_idx" ON "lg_clients"("email");

-- CreateIndex
CREATE INDEX "lg_clients_owner_email_idx" ON "lg_clients"("owner_email");

-- CreateIndex
CREATE INDEX "lg_clients_created_date_idx" ON "lg_clients"("created_date");

-- CreateIndex
CREATE INDEX "lg_compliances_status_idx" ON "lg_compliances"("status");

-- CreateIndex
CREATE INDEX "lg_compliances_owner_email_idx" ON "lg_compliances"("owner_email");

-- CreateIndex
CREATE INDEX "lg_compliances_created_date_idx" ON "lg_compliances"("created_date");

-- CreateIndex
CREATE INDEX "lg_documents_case_id_idx" ON "lg_documents"("case_id");

-- CreateIndex
CREATE INDEX "lg_documents_owner_email_idx" ON "lg_documents"("owner_email");

-- CreateIndex
CREATE INDEX "lg_documents_created_date_idx" ON "lg_documents"("created_date");

-- CreateIndex
CREATE INDEX "lg_hearings_case_id_idx" ON "lg_hearings"("case_id");

-- CreateIndex
CREATE INDEX "lg_hearings_status_idx" ON "lg_hearings"("status");

-- CreateIndex
CREATE INDEX "lg_hearings_owner_email_idx" ON "lg_hearings"("owner_email");

-- CreateIndex
CREATE INDEX "lg_hearings_created_date_idx" ON "lg_hearings"("created_date");

-- CreateIndex
CREATE INDEX "lg_invoices_case_id_idx" ON "lg_invoices"("case_id");

-- CreateIndex
CREATE INDEX "lg_invoices_client_id_idx" ON "lg_invoices"("client_id");

-- CreateIndex
CREATE INDEX "lg_invoices_status_idx" ON "lg_invoices"("status");

-- CreateIndex
CREATE INDEX "lg_invoices_owner_email_idx" ON "lg_invoices"("owner_email");

-- CreateIndex
CREATE INDEX "lg_invoices_created_date_idx" ON "lg_invoices"("created_date");

-- CreateIndex
CREATE INDEX "lg_tasks_case_id_idx" ON "lg_tasks"("case_id");

-- CreateIndex
CREATE INDEX "lg_tasks_status_idx" ON "lg_tasks"("status");

-- CreateIndex
CREATE INDEX "lg_tasks_owner_email_idx" ON "lg_tasks"("owner_email");

-- CreateIndex
CREATE INDEX "lg_tasks_created_date_idx" ON "lg_tasks"("created_date");

-- CreateIndex
CREATE INDEX "lg_transactions_case_id_idx" ON "lg_transactions"("case_id");

-- CreateIndex
CREATE INDEX "lg_transactions_client_id_idx" ON "lg_transactions"("client_id");

-- CreateIndex
CREATE INDEX "lg_transactions_owner_email_idx" ON "lg_transactions"("owner_email");

-- CreateIndex
CREATE INDEX "lg_transactions_created_date_idx" ON "lg_transactions"("created_date");

-- CreateIndex
CREATE INDEX "lawyers_email_idx" ON "lawyers"("email");

-- CreateIndex
CREATE INDEX "lawyers_status_idx" ON "lawyers"("status");

-- CreateIndex
CREATE INDEX "lawyers_created_date_idx" ON "lawyers"("created_date");

-- CreateIndex
CREATE INDEX "lawyer_applications_email_idx" ON "lawyer_applications"("email");

-- CreateIndex
CREATE INDEX "lawyer_applications_status_idx" ON "lawyer_applications"("status");

-- CreateIndex
CREATE INDEX "lawyer_applications_created_date_idx" ON "lawyer_applications"("created_date");

-- CreateIndex
CREATE INDEX "legal_services_created_date_idx" ON "legal_services"("created_date");

-- CreateIndex
CREATE INDEX "messages_case_id_idx" ON "messages"("case_id");

-- CreateIndex
CREATE INDEX "messages_sender_email_idx" ON "messages"("sender_email");

-- CreateIndex
CREATE INDEX "messages_created_date_idx" ON "messages"("created_date");

-- CreateIndex
CREATE INDEX "promo_codes_code_idx" ON "promo_codes"("code");

-- CreateIndex
CREATE INDEX "promo_codes_created_date_idx" ON "promo_codes"("created_date");

-- CreateIndex
CREATE INDEX "rgl_advocates_lawyer_id_idx" ON "rgl_advocates"("lawyer_id");

-- CreateIndex
CREATE INDEX "rgl_advocates_lawyer_email_idx" ON "rgl_advocates"("lawyer_email");

-- CreateIndex
CREATE INDEX "rgl_advocates_status_idx" ON "rgl_advocates"("status");

-- CreateIndex
CREATE INDEX "rgl_advocates_created_date_idx" ON "rgl_advocates"("created_date");

-- CreateIndex
CREATE INDEX "rgl_cases_client_email_idx" ON "rgl_cases"("client_email");

-- CreateIndex
CREATE INDEX "rgl_cases_assigned_advocate_id_idx" ON "rgl_cases"("assigned_advocate_id");

-- CreateIndex
CREATE INDEX "rgl_cases_status_idx" ON "rgl_cases"("status");

-- CreateIndex
CREATE INDEX "rgl_cases_created_date_idx" ON "rgl_cases"("created_date");

-- CreateIndex
CREATE INDEX "rgl_referrals_user_email_idx" ON "rgl_referrals"("user_email");

-- CreateIndex
CREATE INDEX "rgl_referrals_referral_code_idx" ON "rgl_referrals"("referral_code");

-- CreateIndex
CREATE INDEX "rgl_referrals_created_date_idx" ON "rgl_referrals"("created_date");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_policy_number_idx" ON "rgl_subscriptions"("policy_number");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_buyer_email_idx" ON "rgl_subscriptions"("buyer_email");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_referrer_email_idx" ON "rgl_subscriptions"("referrer_email");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_txn_id_idx" ON "rgl_subscriptions"("txn_id");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_status_idx" ON "rgl_subscriptions"("status");

-- CreateIndex
CREATE INDEX "rgl_subscriptions_created_date_idx" ON "rgl_subscriptions"("created_date");

-- CreateIndex
CREATE INDEX "rgl_withdrawals_referrer_email_idx" ON "rgl_withdrawals"("referrer_email");

-- CreateIndex
CREATE INDEX "rgl_withdrawals_referral_code_idx" ON "rgl_withdrawals"("referral_code");

-- CreateIndex
CREATE INDEX "rgl_withdrawals_status_idx" ON "rgl_withdrawals"("status");

-- CreateIndex
CREATE INDEX "rgl_withdrawals_created_date_idx" ON "rgl_withdrawals"("created_date");

-- CreateIndex
CREATE INDEX "service_cases_client_email_idx" ON "service_cases"("client_email");

-- CreateIndex
CREATE INDEX "service_cases_status_idx" ON "service_cases"("status");

-- CreateIndex
CREATE INDEX "service_cases_assigned_lawyer_id_idx" ON "service_cases"("assigned_lawyer_id");

-- CreateIndex
CREATE INDEX "service_cases_created_date_idx" ON "service_cases"("created_date");

-- CreateIndex
CREATE INDEX "service_requests_client_email_idx" ON "service_requests"("client_email");

-- CreateIndex
CREATE INDEX "service_requests_payment_order_id_idx" ON "service_requests"("payment_order_id");

-- CreateIndex
CREATE INDEX "service_requests_status_idx" ON "service_requests"("status");

-- CreateIndex
CREATE INDEX "service_requests_assigned_lawyer_id_idx" ON "service_requests"("assigned_lawyer_id");

-- CreateIndex
CREATE INDEX "service_requests_created_date_idx" ON "service_requests"("created_date");

-- CreateIndex
CREATE INDEX "sessions_user_email_idx" ON "sessions"("user_email");

-- CreateIndex
CREATE INDEX "sessions_lawyer_id_idx" ON "sessions"("lawyer_id");

-- CreateIndex
CREATE INDEX "sessions_consultation_id_idx" ON "sessions"("consultation_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_created_date_idx" ON "sessions"("created_date");

-- CreateIndex
CREATE INDEX "wallets_user_email_idx" ON "wallets"("user_email");

-- CreateIndex
CREATE INDEX "wallets_created_date_idx" ON "wallets"("created_date");

-- CreateIndex
CREATE INDEX "wallet_transactions_user_email_idx" ON "wallet_transactions"("user_email");

-- CreateIndex
CREATE INDEX "wallet_transactions_consultation_id_idx" ON "wallet_transactions"("consultation_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_status_idx" ON "wallet_transactions"("status");

-- CreateIndex
CREATE INDEX "wallet_transactions_reference_id_idx" ON "wallet_transactions"("reference_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_created_date_idx" ON "wallet_transactions"("created_date");

-- CreateIndex
CREATE INDEX "withdrawal_requests_lawyer_id_idx" ON "withdrawal_requests"("lawyer_id");

-- CreateIndex
CREATE INDEX "withdrawal_requests_lawyer_email_idx" ON "withdrawal_requests"("lawyer_email");

-- CreateIndex
CREATE INDEX "withdrawal_requests_status_idx" ON "withdrawal_requests"("status");

-- CreateIndex
CREATE INDEX "withdrawal_requests_created_date_idx" ON "withdrawal_requests"("created_date");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
