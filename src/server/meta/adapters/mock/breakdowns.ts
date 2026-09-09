import type { MetaBreakdownRow, MetaInsightRow } from "@/server/meta/types";
import { stableHash } from "@/server/meta/adapters/mock/hash";

export type MockBreakdownCapability = {
  key: string;
  breakdowns: string[];
  label: string;
  supported: boolean;
  notes: string[];
  metricLimitations?: string[];
};

export const mockBreakdownCapabilities: MockBreakdownCapability[] = [
  { key: "age", breakdowns: ["age"], label: "Age", supported: true, notes: ["Estimated by Meta; use directionally."] },
  { key: "gender", breakdowns: ["gender"], label: "Gender", supported: true, notes: ["Estimated by Meta; not specified may appear."] },
  { key: "age,gender", breakdowns: ["age", "gender"], label: "Age × Gender", supported: true, notes: ["Supported mock equivalent of Meta age + gender combination."] },
  { key: "country", breakdowns: ["country"], label: "Country", supported: true, notes: ["Country values are Meta-returned category codes in live mode."] },
  { key: "region", breakdowns: ["region"], label: "Region", supported: true, notes: ["Off-Meta action metrics may be unavailable with this breakdown."] },
  { key: "publisher_platform", breakdowns: ["publisher_platform"], label: "Publisher Platform", supported: true, notes: ["Returned values should be rendered dynamically."] },
  { key: "publisher_platform,platform_position", breakdowns: ["publisher_platform", "platform_position"], label: "Platform Position", supported: true, notes: ["Valid Meta combination represented in mock data."] },
  { key: "device_platform", breakdowns: ["device_platform"], label: "Device Platform", supported: true, notes: ["Device categories are source-returned values."] },
  { key: "publisher_platform,platform_position,impression_device", breakdowns: ["publisher_platform", "platform_position", "impression_device"], label: "Placement × Impression Device", supported: true, notes: ["Impression device may require feature enablement on some live accounts."] },
  {
    key: "hourly_stats_aggregated_by_advertiser_time_zone",
    breakdowns: ["hourly_stats_aggregated_by_advertiser_time_zone"],
    label: "Hourly by Advertiser Timezone",
    supported: true,
    notes: ["Hourly breakdown uses account timezone."],
    metricLimitations: ["reach", "frequency"]
  },
  {
    key: "hourly_stats_aggregated_by_audience_time_zone",
    breakdowns: ["hourly_stats_aggregated_by_audience_time_zone"],
    label: "Hourly by Audience Timezone",
    supported: false,
    notes: ["Mock simulates account feature not enabled; live accounts may need feature settings or async jobs."],
    metricLimitations: ["reach", "frequency"]
  }
];

const dimensions: Record<string, Array<Record<string, string>>> = {
  age: ["18-24", "25-34", "35-44", "45-54", "55-64"].map((age) => ({ age })),
  gender: ["female", "male", "unknown"].map((gender) => ({ gender })),
  "age,gender": ["18-24", "25-34", "35-44", "45-54"].flatMap((age) => ["female", "male"].map((gender) => ({ age, gender }))),
  country: ["BD", "US", "GB", "AE"].map((country) => ({ country })),
  region: ["Dhaka", "Chattogram", "New York", "California"].map((region) => ({ region })),
  publisher_platform: ["facebook", "instagram", "messenger", "audience_network"].map((publisher_platform) => ({ publisher_platform })),
  "publisher_platform,platform_position": [
    { publisher_platform: "facebook", platform_position: "feed" },
    { publisher_platform: "facebook", platform_position: "marketplace" },
    { publisher_platform: "instagram", platform_position: "stream" },
    { publisher_platform: "instagram", platform_position: "reels" },
    { publisher_platform: "messenger", platform_position: "inbox" }
  ],
  device_platform: ["mobile", "desktop", "tablet"].map((device_platform) => ({ device_platform })),
  "publisher_platform,platform_position,impression_device": [
    { publisher_platform: "facebook", platform_position: "feed", impression_device: "iPhone" },
    { publisher_platform: "facebook", platform_position: "feed", impression_device: "Android Smartphone" },
    { publisher_platform: "instagram", platform_position: "reels", impression_device: "Android Smartphone" },
    { publisher_platform: "instagram", platform_position: "stream", impression_device: "iPhone" },
    { publisher_platform: "facebook", platform_position: "right_hand_column", impression_device: "Desktop" }
  ],
  hourly_stats_aggregated_by_advertiser_time_zone: Array.from({ length: 24 }, (_, hour) => ({
    hourly_stats_aggregated_by_advertiser_time_zone: `${String(hour).padStart(2, "0")}:00:00 - ${String(hour).padStart(2, "0")}:59:59`
  }))
};

export function findBreakdownCapability(breakdowns: string[]) {
  const requested = [...breakdowns].sort().join(",");
  return mockBreakdownCapabilities.find((capability) => [...capability.breakdowns].sort().join(",") === requested);
}

export function getBreakdownKey(breakdowns: string[]) {
  return findBreakdownCapability(breakdowns)?.key ?? [...breakdowns].sort().join(",");
}

export function splitInsightByBreakdown(row: MetaInsightRow, breakdowns: string[]): MetaBreakdownRow[] {
  const key = getBreakdownKey(breakdowns);
  const groups = dimensions[key];
  if (!groups) return [];

  const weighted = groups.map((values) => ({ values, weight: 1 + (stableHash(`${row.entityId}:${row.dateStart}:${JSON.stringify(values)}`) % 7) }));
  const totalWeight = weighted.reduce((total, item) => total + item.weight, 0);

  return weighted.map((item, index) => {
    const fraction = item.weight / totalWeight;
    const scale = (value: number | null, decimals = 0) => {
      if (value === null) return null;
      if (index === weighted.length - 1) return Number((value * fraction).toFixed(decimals));
      return Number((value * fraction).toFixed(decimals));
    };
    const isHourly = key.startsWith("hourly_stats");

    return {
      ...row,
      breakdownKey: key,
      breakdownValues: item.values,
      spend: scale(row.spend, 2),
      impressions: scale(row.impressions),
      reach: isHourly ? null : scale(row.reach),
      clicks: scale(row.clicks),
      linkClicks: scale(row.linkClicks),
      outboundClicks: scale(row.outboundClicks),
      conversions: scale(row.conversions, 2),
      conversionValue: key === "region" ? null : scale(row.conversionValue, 2),
      availability: {
        ...row.availability,
        reach: isHourly ? "unsupported" : "available",
        conversionValue: key === "region" ? "unsupported" : row.availability.conversionValue
      }
    };
  });
}
