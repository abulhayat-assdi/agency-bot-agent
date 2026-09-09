import type { MetaEntityLevel } from "@/server/meta";

export type BreakdownCategory = "audience" | "geo" | "platform" | "device" | "time";

export type BreakdownCapability = {
  key: string;
  label: string;
  category: BreakdownCategory;
  dimensions: string[];
  supported: boolean;
  supportedLevels: MetaEntityLevel[];
  compatibleDimensionSets: string[][];
  incompatibleFields: string[];
  metricLimitations: string[];
  requiresFeature?: string;
  notes: string[];
};

export const breakdownCapabilities: BreakdownCapability[] = [
  {
    key: "age",
    label: "Age",
    category: "audience",
    dimensions: ["age"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["age"], ["age", "gender"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Breakdown values are estimated by Meta."],
    notes: ["Use directionally and avoid over-interpreting very small segments."]
  },
  {
    key: "gender",
    label: "Gender",
    category: "audience",
    dimensions: ["gender"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["gender"], ["age", "gender"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Breakdown values are estimated by Meta."],
    notes: ["Meta may return not specified or unknown values."]
  },
  {
    key: "age,gender",
    label: "Age × Gender",
    category: "audience",
    dimensions: ["age", "gender"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["age", "gender"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Breakdown values are estimated and should be treated directionally."],
    notes: ["Supported Meta combination represented in the mock provider."]
  },
  {
    key: "country",
    label: "Country",
    category: "geo",
    dimensions: ["country"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["country"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Do not infer precision beyond Meta country categories."],
    notes: ["Country values should be rendered dynamically from returned data."]
  },
  {
    key: "region",
    label: "Region",
    category: "geo",
    dimensions: ["region"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["region"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Off-Meta action metrics may be unavailable with region breakdowns.", "Some video action metrics do not support region."],
    notes: ["Use only Meta-returned region categories."]
  },
  {
    key: "publisher_platform",
    label: "Publisher Platform",
    category: "platform",
    dimensions: ["publisher_platform"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["publisher_platform"], ["publisher_platform", "platform_position"], ["publisher_platform", "platform_position", "impression_device"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Returned categories may change; UI must not hard-code old placement lists."],
    notes: ["Examples can include Facebook, Instagram, Messenger, Audience Network, or new Meta-returned values."]
  },
  {
    key: "publisher_platform,platform_position",
    label: "Publisher Platform × Position",
    category: "platform",
    dimensions: ["publisher_platform", "platform_position"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["publisher_platform", "platform_position"], ["publisher_platform", "platform_position", "impression_device"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Placement labels are Meta-returned categories."],
    notes: ["Use for platform/placement analysis where supported."]
  },
  {
    key: "device_platform",
    label: "Device Platform",
    category: "device",
    dimensions: ["device_platform"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["device_platform"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Do not assume only mobile and desktop; render source-returned categories."],
    notes: ["Useful for device performance analysis."]
  },
  {
    key: "publisher_platform,platform_position,impression_device",
    label: "Placement × Impression Device",
    category: "device",
    dimensions: ["publisher_platform", "platform_position", "impression_device"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["publisher_platform", "platform_position", "impression_device"]],
    incompatibleFields: ["app_store_clicks", "newsfeed_avg_position", "newsfeed_clicks", "relevance_score", "newsfeed_impressions"],
    metricLimitations: ["Impression device may be unavailable unless account feature settings are enabled."],
    requiresFeature: "impression_device",
    notes: ["Live accounts may require feature enablement or async reports."]
  },
  {
    key: "hourly_stats_aggregated_by_advertiser_time_zone",
    label: "Hourly by Advertiser Timezone",
    category: "time",
    dimensions: ["hourly_stats_aggregated_by_advertiser_time_zone"],
    supported: true,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["hourly_stats_aggregated_by_advertiser_time_zone"]],
    incompatibleFields: ["reach", "frequency", "unique_*", "video_*"],
    metricLimitations: ["Hourly breakdowns do not support reach or frequency.", "Video fields cannot be requested with hourly stats breakdowns."],
    notes: ["Use ad account timezone and clearly label the timezone."]
  },
  {
    key: "hourly_stats_aggregated_by_audience_time_zone",
    label: "Hourly by Audience Timezone",
    category: "time",
    dimensions: ["hourly_stats_aggregated_by_audience_time_zone"],
    supported: false,
    supportedLevels: ["account", "campaign", "adset", "ad"],
    compatibleDimensionSets: [["hourly_stats_aggregated_by_audience_time_zone"]],
    incompatibleFields: ["reach", "frequency", "unique_*", "video_*"],
    metricLimitations: ["May be unavailable for some accounts unless feature settings are enabled or async jobs are used."],
    requiresFeature: "time_of_day_viewer_tz",
    notes: ["Disabled in mock mode to exercise conditional availability UI."]
  }
];

export type BreakdownValidation = {
  supported: boolean;
  capability?: BreakdownCapability;
  reason?: string;
};

export function findBreakdownCapabilityByKey(key: string) {
  return breakdownCapabilities.find((capability) => capability.key === key);
}

export function validateBreakdownRequest(key: string, level: MetaEntityLevel): BreakdownValidation {
  const capability = findBreakdownCapabilityByKey(key);

  if (!capability) {
    return { supported: false, reason: "Unknown breakdown combination." };
  }

  if (!capability.supported) {
    return { supported: false, capability, reason: capability.notes.join(" ") || "Breakdown is currently unsupported." };
  }

  if (!capability.supportedLevels.includes(level)) {
    return { supported: false, capability, reason: `Breakdown is not supported at ${level} level.` };
  }

  return { supported: true, capability };
}
