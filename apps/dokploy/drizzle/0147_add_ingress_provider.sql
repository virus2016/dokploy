CREATE TYPE "public"."ingressProvider" AS ENUM('traefik', 'caddy');--> statement-breakpoint
ALTER TABLE "webServerSettings" ADD COLUMN "ingressProvider" "ingressProvider" NOT NULL DEFAULT 'traefik';
