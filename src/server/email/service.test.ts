import { describe, expect, it, vi } from "vitest";

import { getEmailProviderReadiness, mockEmailReportConfigs, renderEmailReport, sendEmailReport, type EmailProvider } from "@/server/email";

describe("email reporting", () => {
  it("renders deterministic account report content with metric states and caveats", async () => {
    const report = mockEmailReportConfigs[0];
    const rendered = await renderEmailReport(report, { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" });

    expect(rendered.subject).toContain(report.name);
    expect(rendered.text).toContain("Metrics:");
    expect(rendered.text).toContain("ROAS");
    expect(rendered.text).toContain("Caveats:");
    expect(rendered.text).not.toContain("- Actual profit:");
    expect(rendered.html).toContain("<table");
    expect(rendered.currency).toBe("BDT");
  });

  it("sends enabled reports through the configured provider abstraction", async () => {
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ status: "sent" as const, provider: "mock" as const, providerMessageId: "mock_delivery", safeMessage: "sent" }))
    };

    const log = await sendEmailReport("email_report_northstar_weekly", { provider, env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" } });

    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ to: expect.arrayContaining(["owner@example.com"]), subject: expect.stringContaining("Northstar") }));
    expect(log.status).toBe("sent");
    expect(log.providerMessageId).toBe("mock_delivery");
    expect(log.recipientCount).toBe(2);
  });

  it("skips disabled reports without calling provider", async () => {
    const provider: EmailProvider = {
      send: vi.fn(async () => ({ status: "sent" as const, provider: "mock" as const, safeMessage: "sent" }))
    };

    const log = await sendEmailReport("email_report_paused_ad", { provider, env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" } });

    expect(provider.send).not.toHaveBeenCalled();
    expect(log.status).toBe("skipped");
    expect(log.safeError).toBe("Report is disabled");
  });

  it("records safe provider failures without exposing credentials", async () => {
    const provider: EmailProvider = {
      send: vi.fn(async () => {
        throw new Error("Provider rejected recipient domain");
      })
    };

    const log = await sendEmailReport("email_report_northstar_weekly", { provider, env: { APP_ENV: "test", EMAIL_PROVIDER: "mock", META_PROVIDER: "mock" } });

    expect(log.status).toBe("failed");
    expect(log.safeError).toContain("Provider rejected recipient domain");
    expect(JSON.stringify(log)).not.toContain("RESEND_API_KEY");
    expect(JSON.stringify(log)).not.toContain("Bearer");
  });

  it("reports provider readiness without exposing API keys", () => {
    const readiness = getEmailProviderReadiness({ APP_ENV: "test", EMAIL_PROVIDER: "resend", RESEND_API_KEY: "secret-value", EMAIL_FROM: "reports@example.com" });

    expect(readiness).toEqual({ provider: "resend", configured: true, fromConfigured: true });
    expect(JSON.stringify(readiness)).not.toContain("secret-value");
  });
});
