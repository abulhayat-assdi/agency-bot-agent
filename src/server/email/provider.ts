import { getAppConfig } from "@/server/config/env";
import { logger } from "@/server/observability/logger";
import type { EmailProvider, EmailSendInput, EmailSendResult } from "@/server/email/types";

function validateRecipients(to: string[]) {
  if (to.length === 0) throw new Error("At least one email recipient is required");
  if (to.length > 25) throw new Error("Email recipient limit exceeded");
}

export class MockEmailProvider implements EmailProvider {
  async send(input: EmailSendInput): Promise<EmailSendResult> {
    validateRecipients(input.to);
    const providerMessageId = `mock_email_${Buffer.from(`${input.subject}:${input.to.join(",")}`).toString("base64url").slice(0, 18)}`;
    logger.info("Mock email provider accepted message", {
      provider: "mock",
      providerMessageId,
      recipientCount: input.to.length,
      subjectLength: input.subject.length
    });
    return {
      status: "sent",
      provider: "mock",
      providerMessageId,
      safeMessage: "Mock email accepted; no external message was sent"
    };
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string
  ) {}

  async send(input: EmailSendInput): Promise<EmailSendResult> {
    validateRecipients(input.to);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        headers: {
          "X-Entity-Ref-ID": String(input.metadata?.reportId ?? "meta-ads-report")
        }
      })
    });

    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: string };
    if (!response.ok) {
      const safeMessage = body.message ?? body.error ?? `Resend request failed with status ${response.status}`;
      logger.warn("Resend email request failed", { provider: "resend", status: response.status, safeMessage });
      throw new Error(safeMessage);
    }

    return {
      status: "sent",
      provider: "resend",
      providerMessageId: body.id,
      safeMessage: "Resend accepted message"
    };
  }
}

export function createEmailProvider(env: Record<string, string | undefined> = process.env): EmailProvider {
  const config = getAppConfig(env);
  if (config.EMAIL_PROVIDER === "resend") {
    if (!config.RESEND_API_KEY || !config.EMAIL_FROM) {
      throw new Error("RESEND_API_KEY and EMAIL_FROM are required when EMAIL_PROVIDER=resend");
    }
    return new ResendEmailProvider(config.RESEND_API_KEY, config.EMAIL_FROM);
  }
  return new MockEmailProvider();
}

export function getEmailProviderReadiness(env: Record<string, string | undefined> = process.env) {
  const config = getAppConfig(env);
  return {
    provider: config.EMAIL_PROVIDER,
    configured: config.EMAIL_PROVIDER === "mock" || Boolean(config.RESEND_API_KEY && config.EMAIL_FROM),
    fromConfigured: Boolean(config.EMAIL_FROM)
  };
}
