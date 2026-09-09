import type { MetaAd, MetaAdAccount, MetaInsightRow, MetaMetrics } from "@/server/meta/types";
import { dayOfMonth } from "@/server/meta/adapters/mock/date-utils";
import { mockAdSets, mockCampaigns } from "@/server/meta/adapters/mock/fixtures";
import { stableHash } from "@/server/meta/adapters/mock/hash";

function round(value: number, decimals = 2) {
  return Number(value.toFixed(decimals));
}

export function createAdDailyMetrics(ad: MetaAd, account: MetaAdAccount, date: string): MetaInsightRow {
  const seed = stableHash(`${ad.id}:${date}`);
  const day = dayOfMonth(date);
  const campaign = mockCampaigns.find((item) => item.id === ad.campaignId);
  const isAwareness = campaign?.objective === "OUTCOME_AWARENESS";
  const isRetargeting = campaign?.name.includes("Retargeting") ?? false;
  const formatBoost = ad.name.includes("Video") ? 1.14 : 1;
  const base = 650 + (seed % 2600);
  const weekdayFactor = [0.9, 1, 1.03, 1.08, 1.12, 0.86, 0.82][new Date(`${date}T00:00:00.000Z`).getUTCDay()];
  const impressions = Math.max(0, Math.round(base * weekdayFactor * formatBoost));
  const ctrBase = isAwareness ? 0.006 : isRetargeting ? 0.019 : 0.013;
  const clicks = Math.min(impressions, Math.round(impressions * (ctrBase + (seed % 9) / 10000)));
  const linkClicks = Math.min(clicks, Math.round(clicks * (isAwareness ? 0.55 : 0.82)));
  const outboundClicks = day % 11 === 0 ? null : Math.min(linkClicks, Math.round(linkClicks * 0.72));
  const cpm = account.currency === "BDT" ? 145 + (seed % 40) : 7 + (seed % 350) / 100;
  const spend = impressions === 0 ? 0 : round((impressions / 1000) * cpm, 2);
  const conversionRate = isAwareness ? 0 : isRetargeting ? 0.085 : 0.043;
  const conversions = isAwareness ? 0 : Math.min(clicks, round(clicks * conversionRate * (0.8 + (seed % 7) / 20), 2));
  const conversionValue = isAwareness || day % 17 === 0 ? null : round(conversions * (account.currency === "BDT" ? 2350 + (seed % 700) : 38 + (seed % 18)), 2);
  const reach = Math.max(0, Math.round(impressions / (1.18 + (seed % 20) / 100)));

  const metrics: MetaMetrics = {
    spend,
    impressions,
    reach,
    clicks,
    linkClicks,
    outboundClicks,
    conversions,
    conversionValue,
    videoMetrics: ad.name.includes("Video")
      ? {
          video_p25_watched_actions: Math.round(impressions * 0.28),
          video_p50_watched_actions: Math.round(impressions * 0.18),
          video_p75_watched_actions: Math.round(impressions * 0.11),
          video_p100_watched_actions: Math.round(impressions * 0.06)
        }
      : {},
    engagementMetrics: {
      post_engagement: Math.round(clicks * 1.35),
      page_engagement: Math.round(clicks * 1.52)
    },
    actionMetrics: isAwareness
      ? { link_click: linkClicks }
      : {
          link_click: linkClicks,
          purchase: conversions
        }
  };

  return {
    ...metrics,
    accountId: account.id,
    level: "ad",
    entityId: ad.id,
    entityName: ad.name,
    dateStart: date,
    dateStop: date,
    timezone: account.timezone,
    currency: account.currency,
    attributionContext: {
      windows: isAwareness ? [] : ["7d_click", "1d_view"],
      actionReportTime: "mixed",
      source: "mock"
    },
    availability: {
      outboundClicks: outboundClicks === null ? "null_from_source" : "available",
      conversionValue: conversionValue === null ? (isAwareness ? "unsupported" : "unavailable") : "available",
      conversions: conversions === 0 && isAwareness ? "actual_zero" : "available"
    }
  };
}

export function aggregateInsightRows(rows: MetaInsightRow[], level: MetaInsightRow["level"], entityId: string, entityName: string): MetaInsightRow {
  const first = rows[0];
  if (!first) throw new Error("Cannot aggregate empty insight rows");

  const sumNullable = (key: keyof Pick<MetaMetrics, "spend" | "impressions" | "reach" | "clicks" | "linkClicks" | "outboundClicks" | "conversions" | "conversionValue">) => {
    const values = rows.map((row) => row[key]);
    const available = values.filter((value): value is number => typeof value === "number");
    if (available.length === 0) return null;
    return round(available.reduce((total, value) => total + value, 0), key === "impressions" || key === "reach" || key === "clicks" || key === "linkClicks" || key === "outboundClicks" ? 0 : 2);
  };

  const availability: MetaInsightRow["availability"] = {};
  for (const key of ["outboundClicks", "conversionValue"] as const) {
    const states = new Set(rows.map((row) => row.availability[key]).filter(Boolean));
    availability[key] = states.has("unavailable") || states.has("unsupported") || states.has("null_from_source") ? "partial" : "available";
  }

  return {
    accountId: first.accountId,
    level,
    entityId,
    entityName,
    dateStart: first.dateStart,
    dateStop: first.dateStop,
    timezone: first.timezone,
    currency: first.currency,
    attributionContext: first.attributionContext,
    availability,
    spend: sumNullable("spend"),
    impressions: sumNullable("impressions"),
    reach: sumNullable("reach"),
    clicks: sumNullable("clicks"),
    linkClicks: sumNullable("linkClicks"),
    outboundClicks: sumNullable("outboundClicks"),
    conversions: sumNullable("conversions"),
    conversionValue: sumNullable("conversionValue"),
    videoMetrics: {},
    engagementMetrics: {},
    actionMetrics: {}
  };
}

export function parentIdsForLevel(ad: MetaAd, level: "account" | "campaign" | "adset" | "ad") {
  if (level === "ad") return ad.id;
  if (level === "adset") return ad.adSetId;
  if (level === "campaign") return ad.campaignId;
  return ad.accountId;
}

export function nameForEntity(level: MetaInsightRow["level"], entityId: string, accountName: string) {
  if (level === "account") return accountName;
  if (level === "campaign") return mockCampaigns.find((item) => item.id === entityId)?.name ?? entityId;
  if (level === "adset") return mockAdSets.find((item) => item.id === entityId)?.name ?? entityId;
  return entityId;
}
