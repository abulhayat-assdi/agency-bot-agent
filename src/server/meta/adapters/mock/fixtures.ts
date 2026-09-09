import type { MetaAd, MetaAdAccount, MetaAdSet, MetaCampaign, MetaCreative } from "@/server/meta/types";

export const mockAccounts: MetaAdAccount[] = [
  {
    id: "act_100000000000001",
    accountId: "100000000000001",
    name: "Northstar Commerce - BD",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    accessStatus: "connected"
  },
  {
    id: "act_200000000000002",
    accountId: "200000000000002",
    name: "Studio Atlas - US",
    currency: "USD",
    timezone: "America/New_York",
    accessStatus: "connected"
  }
];

const campaignTemplates = [
  ["Conversions", "OUTCOME_SALES", "AUCTION"],
  ["Retargeting", "OUTCOME_SALES", "AUCTION"],
  ["Awareness", "OUTCOME_AWARENESS", "AUCTION"]
] as const;

export const mockCampaigns: MetaCampaign[] = mockAccounts.flatMap((account, accountIndex) =>
  campaignTemplates.map(([label, objective, buyingType], index) => ({
    id: `${account.accountId}${index + 1}01`,
    accountId: account.id,
    name: `${account.name.split(" - ")[0]} ${label}`,
    status: index === 2 ? "PAUSED" : "ACTIVE",
    effectiveStatus: index === 2 ? "PAUSED" : "ACTIVE",
    objective,
    buyingType: accountIndex === 1 && index === 2 ? "RESERVED" : buyingType
  }))
);

export const mockAdSets: MetaAdSet[] = mockCampaigns.flatMap((campaign, campaignIndex) =>
  ["Prospecting", "Remarketing"].map((segment, index) => ({
    id: `${campaign.id}${index + 1}1`,
    accountId: campaign.accountId,
    campaignId: campaign.id,
    name: `${campaign.name} - ${segment}`,
    status: campaign.status,
    effectiveStatus: campaign.effectiveStatus,
    optimizationGoal: campaign.objective === "OUTCOME_AWARENESS" ? "REACH" : index === 0 ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS",
    billingEvent: campaign.objective === "OUTCOME_AWARENESS" ? "IMPRESSIONS" : "IMPRESSIONS",
    attributionSpec: {
      windows: campaignIndex % 2 === 0 ? ["7d_click", "1d_view"] : ["1d_click", "1d_view"],
      source: "mock"
    }
  }))
);

export const mockAds: MetaAd[] = mockAdSets.flatMap((adSet, adSetIndex) =>
  ["Static", "Video"].map((format, index) => ({
    id: `${adSet.id}${index + 1}9`,
    accountId: adSet.accountId,
    campaignId: adSet.campaignId,
    adSetId: adSet.id,
    creativeId: `cr_${adSet.id}${index + 1}`,
    name: `${adSet.name} - ${format} Ad`,
    status: adSetIndex % 5 === 0 && index === 1 ? "PAUSED" : "ACTIVE",
    effectiveStatus: adSetIndex % 5 === 0 && index === 1 ? "PAUSED" : "ACTIVE"
  }))
);

export const mockCreatives: MetaCreative[] = mockAds.map((ad, index) => ({
  id: ad.creativeId,
  adId: ad.id,
  name: `${ad.name} Creative`,
  pageId: `page_${ad.accountId.replace("act_", "")}`,
  instagramActorId: index % 2 === 0 ? `ig_${ad.accountId.replace("act_", "")}` : undefined,
  thumbnailUrl: `https://example.com/mock-creative/${ad.creativeId}.jpg`,
  objectType: ad.name.includes("Video") ? "video" : index % 4 === 0 ? "carousel" : "image",
  metadata: {
    callToAction: index % 3 === 0 ? "SHOP_NOW" : "LEARN_MORE",
    destinationType: ad.name.includes("Retargeting") ? "website" : "facebook_page",
    mockOnly: true
  }
}));
