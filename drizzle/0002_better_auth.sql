-- Better Auth core tables (required for /api/auth sign-up & sign-in).
-- Previously only created by deprecated PostgresDatabaseAdapter.initializeSchema().
CREATE TABLE IF NOT EXISTS "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" text DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"lastLoginAt" timestamptz,
	"createdAt" timestamptz DEFAULT now() NOT NULL,
	"updatedAt" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"token" text NOT NULL UNIQUE,
	"expiresAt" timestamptz NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamptz DEFAULT now() NOT NULL,
	"updatedAt" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
	"providerId" text NOT NULL,
	"accountId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamptz,
	"refreshTokenExpiresAt" timestamptz,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamptz DEFAULT now() NOT NULL,
	"updatedAt" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamptz NOT NULL,
	"createdAt" timestamptz DEFAULT now() NOT NULL
);
