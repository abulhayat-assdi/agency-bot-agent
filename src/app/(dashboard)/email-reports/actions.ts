"use server";

import { z } from "zod";

import { logger } from "@/server/observability/logger";

export type EmailConfigFormState = {
  status: "idle" | "success" | "error";
  message: string;
};

const emailListSchema = z
  .string()
  .min(1, "Add at least one recipient")
  .transform((value) =>
    value
      .split(/[\n,]+/)
      .map((email) => email.trim())
      .filter(Boolean)
  )
  .pipe(z.array(z.string().email()).min(1).max(25));

const providerSchema = z.object({
  provider: z.enum(["mock", "resend"]),
  fromEmail: z.string().email("Use a verified sender email"),
  apiKeySet: z.enum(["configured", "missing"])
});

const routingSchema = z.object({
  reportId: z.string().min(1),
  accountId: z.string().min(1),
  recipients: emailListSchema,
  cadence: z.enum(["daily", "weekly", "monthly"]),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time")
});

export async function saveEmailProviderConfigAction(_prevState: EmailConfigFormState, formData: FormData): Promise<EmailConfigFormState> {
  const parsed = providerSchema.safeParse({
    provider: formData.get("provider"),
    fromEmail: formData.get("fromEmail"),
    apiKeySet: formData.get("apiKeySet")
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Provider settings need review." };
  }

  logger.info("Email provider configuration validated", {
    provider: parsed.data.provider,
    fromConfigured: true,
    apiKeySet: parsed.data.apiKeySet === "configured"
  });

  return {
    status: "success",
    message: parsed.data.provider === "resend" ? "Provider settings validated. Store the API key in environment secrets before live sending." : "Mock provider selected for safe preview sends."
  };
}

export async function saveEmailRoutingAction(_prevState: EmailConfigFormState, formData: FormData): Promise<EmailConfigFormState> {
  const parsed = routingSchema.safeParse({
    reportId: formData.get("reportId"),
    accountId: formData.get("accountId"),
    recipients: formData.get("recipients"),
    cadence: formData.get("cadence"),
    localTime: formData.get("localTime")
  });

  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Report routing needs review." };
  }

  logger.info("Email report routing validated", {
    reportId: parsed.data.reportId,
    accountId: parsed.data.accountId,
    recipientCount: parsed.data.recipients.length,
    cadence: parsed.data.cadence
  });

  return { status: "success", message: "Report routing validated for this account and recipient list." };
}
