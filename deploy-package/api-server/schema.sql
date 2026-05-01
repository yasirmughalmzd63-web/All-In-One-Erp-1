CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'cashier' NOT NULL,
	"location_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"privileges" text,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);

CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);

CREATE TABLE "locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cash' NOT NULL,
	"balance" text DEFAULT '0.00000000' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"location_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'product' NOT NULL,
	"description" text,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sku" text,
	"category_id" integer,
	"unit_price" text DEFAULT '0.00000000' NOT NULL,
	"wholesale_price" text DEFAULT '0.00000000' NOT NULL,
	"cost_price" text DEFAULT '0.00000000' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"location_id" integer,
	"unit" text DEFAULT 'pcs' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"image_url" text,
	"topup_coins_per_usd" text,
	"topup_exchange_rate_pkr" text,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"credit_balance" text DEFAULT '0.00000000' NOT NULL,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"balance" text DEFAULT '0.00000000' NOT NULL,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "sale_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"sale_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" text NOT NULL,
	"total" text NOT NULL
);

CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_no" text NOT NULL,
	"customer_id" integer,
	"location_id" integer,
	"account_id" integer,
	"user_id" integer NOT NULL,
	"subtotal" text DEFAULT '0.00000000' NOT NULL,
	"discount" text DEFAULT '0.00000000' NOT NULL,
	"tax" text DEFAULT '0.00000000' NOT NULL,
	"total" text DEFAULT '0.00000000' NOT NULL,
	"amount_paid" text DEFAULT '0.00000000' NOT NULL,
	"change" text DEFAULT '0.00000000' NOT NULL,
	"payment_method" text DEFAULT 'cash' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"notes" text,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_invoice_no_unique" UNIQUE("invoice_no")
);

CREATE TABLE "purchase_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" text NOT NULL,
	"total" text NOT NULL
);

CREATE TABLE "purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_no" text NOT NULL,
	"supplier_id" integer,
	"location_id" integer,
	"account_id" integer,
	"user_id" integer NOT NULL,
	"business_id" integer,
	"subtotal" text DEFAULT '0.00000000' NOT NULL,
	"discount" text DEFAULT '0.00000000' NOT NULL,
	"total" text DEFAULT '0.00000000' NOT NULL,
	"amount_paid" text DEFAULT '0.00000000' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_invoice_no_unique" UNIQUE("invoice_no")
);

CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"amount" text DEFAULT '0.00000000' NOT NULL,
	"category_id" integer,
	"account_id" integer,
	"user_id" integer NOT NULL,
	"notes" text,
	"date" text NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text DEFAULT 'receivable' NOT NULL,
	"party_id" integer NOT NULL,
	"party_type" text DEFAULT 'customer' NOT NULL,
	"amount" text DEFAULT '0.00000000' NOT NULL,
	"paid_amount" text DEFAULT '0.00000000' NOT NULL,
	"remaining_amount" text DEFAULT '0.00000000' NOT NULL,
	"due_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"user_id" integer NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "credit_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_id" integer NOT NULL,
	"amount" text DEFAULT '0.00000000' NOT NULL,
	"payment_method" text DEFAULT 'account' NOT NULL,
	"account_id" integer,
	"dollar_amount" text,
	"dollar_rate" text,
	"product_id" integer,
	"product_name" text,
	"product_qty" text,
	"product_value_pkr" text,
	"notes" text,
	"user_id" integer NOT NULL,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "wallets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'cash' NOT NULL,
	"balance" text DEFAULT '0.00000000' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"details" text,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "currency_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"currency_type" text DEFAULT 'USD' NOT NULL,
	"type" text DEFAULT 'purchase' NOT NULL,
	"amount" text DEFAULT '0.00000000' NOT NULL,
	"rate" text DEFAULT '0.00000000' NOT NULL,
	"total_in_base" text DEFAULT '0.00000000' NOT NULL,
	"account_id" integer,
	"user_id" integer NOT NULL,
	"notes" text,
	"date" text NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "cash_counts" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"stock_value" text DEFAULT '0.00000000' NOT NULL,
	"bank_balance" text DEFAULT '0.00000000' NOT NULL,
	"credit_receivable" text DEFAULT '0.00000000' NOT NULL,
	"credits_received" text DEFAULT '0.00000000' NOT NULL,
	"transfers_in" text DEFAULT '0.00000000' NOT NULL,
	"transfers_out" text DEFAULT '0.00000000' NOT NULL,
	"opening_balance" text DEFAULT '0.00000000' NOT NULL,
	"expected_balance" text DEFAULT '0.00000000' NOT NULL,
	"physical_balance" text DEFAULT '0.00000000' NOT NULL,
	"difference" text DEFAULT '0.00000000' NOT NULL,
	"diff_type" text DEFAULT 'balanced' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"notes" text,
	"user_id" integer NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "dollar_wallet" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_type" text DEFAULT 'received' NOT NULL,
	"amount_usd" text DEFAULT '0.00000000' NOT NULL,
	"rate" text DEFAULT '0.00000000' NOT NULL,
	"total_pkr" text DEFAULT '0.00000000' NOT NULL,
	"party_name" text,
	"party_type" text,
	"party_id" integer,
	"wallet_id" integer,
	"account_id" integer,
	"product_id" integer,
	"qty" integer,
	"payment_mode" text DEFAULT 'wallet',
	"notes" text,
	"date" text NOT NULL,
	"user_id" text DEFAULT '0' NOT NULL,
	"payment_proof_url" text,
	"payment_proof_key" text,
	"proof_verified_at" timestamp with time zone,
	"proof_verified_by" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_location_id" integer NOT NULL,
	"to_location_id" integer NOT NULL,
	"from_product_id" integer NOT NULL,
	"to_product_id" integer NOT NULL,
	"qty" integer NOT NULL,
	"notes" text,
	"user_id" integer NOT NULL,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "business_registrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"business_name" text NOT NULL,
	"business_type" text NOT NULL,
	"owner_name" text NOT NULL,
	"email" text,
	"phone" text,
	"address" text,
	"purpose" text,
	"package" text DEFAULT 'basic' NOT NULL,
	"admin_username" text NOT NULL,
	"admin_password_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"rejection_reason" text,
	"payment_method" text,
	"payment_status" text DEFAULT 'trial',
	"subscription_end_date" text,
	"monthly_fee" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"address" text,
	"position" text,
	"department" text,
	"base_salary" text DEFAULT '0.00' NOT NULL,
	"join_date" text,
	"status" text DEFAULT 'active' NOT NULL,
	"payment_method" text,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"date" text NOT NULL,
	"status" text DEFAULT 'present' NOT NULL,
	"check_in" text,
	"check_out" text,
	"notes" text,
	"marked_by" integer,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "payroll" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"base_salary" text DEFAULT '0.00' NOT NULL,
	"working_days" integer DEFAULT 26 NOT NULL,
	"present_days" integer DEFAULT 0 NOT NULL,
	"half_days" integer DEFAULT 0 NOT NULL,
	"overtime_hours" text DEFAULT '0' NOT NULL,
	"overtime_rate" text DEFAULT '0' NOT NULL,
	"gross_salary" text DEFAULT '0.00' NOT NULL,
	"bonus_total" text DEFAULT '0.00' NOT NULL,
	"fine_total" text DEFAULT '0.00' NOT NULL,
	"deductions" text DEFAULT '0.00' NOT NULL,
	"net_salary" text DEFAULT '0.00' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_at" text,
	"notes" text,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "employee_fines" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" text DEFAULT '0.00' NOT NULL,
	"reason" text NOT NULL,
	"date" text NOT NULL,
	"payroll_id" integer,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "employee_bonuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" text DEFAULT '0.00' NOT NULL,
	"reason" text NOT NULL,
	"date" text NOT NULL,
	"payroll_id" integer,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "usd_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"dollar_amount" text DEFAULT '0.00' NOT NULL,
	"dollar_rate" text DEFAULT '0.00' NOT NULL,
	"total_pkr" text DEFAULT '0.00' NOT NULL,
	"coins_pkr" text DEFAULT '0.00' NOT NULL,
	"coins_product_id" integer,
	"coins_product_name" text,
	"coins_qty" text DEFAULT '0' NOT NULL,
	"cash_pkr" text DEFAULT '0.00' NOT NULL,
	"cash_account_id" integer,
	"cash_account_name" text,
	"credit_pkr" text DEFAULT '0.00' NOT NULL,
	"credit_id" integer,
	"notes" text,
	"date" text NOT NULL,
	"user_id" integer,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'daily' NOT NULL,
	"scope" text DEFAULT 'app' NOT NULL,
	"employee_id" integer,
	"user_id" integer,
	"target_amount" text DEFAULT '0.00' NOT NULL,
	"commission_type" text DEFAULT 'flat' NOT NULL,
	"commission_value" text DEFAULT '0.00' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"achieved_amount" text DEFAULT '0.00' NOT NULL,
	"bonus_id" integer,
	"location_id" integer,
	"business_id" integer,
	"notes" text,
	"is_challenge" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"verified_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type" text DEFAULT 'annual' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"total_days" text DEFAULT '1' NOT NULL,
	"reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" integer,
	"review_notes" text,
	"submitted_by" integer NOT NULL,
	"location_id" integer,
	"business_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "app_coin_credit_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_id" integer NOT NULL,
	"business_id" integer,
	"amount_pkr" text DEFAULT '0' NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"notes" text,
	"date" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "app_coin_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"business_id" integer,
	"qty" integer DEFAULT 0 NOT NULL,
	"unit_price_pkr" text DEFAULT '0' NOT NULL,
	"total_pkr" text DEFAULT '0' NOT NULL,
	"paid_pkr" text DEFAULT '0' NOT NULL,
	"remaining_pkr" text DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"date" text NOT NULL,
	"due_date" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "dollar_wallet_entry_type_created_idx" ON "dollar_wallet" USING btree ("entry_type","created_at");
CREATE INDEX "dollar_wallet_wallet_created_idx" ON "dollar_wallet" USING btree ("wallet_id","created_at");
