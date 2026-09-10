export type GraphApiPaging = {
  cursors?: {
    before?: string;
    after?: string;
  };
  next?: string;
};

export type GraphApiErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
};

export type GraphApiPage<T> = {
  data?: T[];
  paging?: GraphApiPaging;
};

export type GraphAdAccount = {
  id: string;
  account_id?: string;
  name?: string;
  currency?: string;
  timezone_name?: string;
  account_status?: number;
};

export type GraphCampaign = {
  id: string;
  account_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  buying_type?: string;
  start_time?: string;
  stop_time?: string;
};

export type GraphAdSet = {
  id: string;
  account_id?: string;
  campaign_id?: string;
  name?: string;
  status?: string;
  effective_status?: string;
  optimization_goal?: string;
  billing_event?: string;
  attribution_spec?: Record<string, unknown>[];
  start_time?: string;
  end_time?: string;
};

export type GraphAd = {
  id: string;
  account_id?: string;
  campaign_id?: string;
  adset_id?: string;
  creative?: { id?: string };
  name?: string;
  status?: string;
  effective_status?: string;
};

export type GraphCreative = {
  id: string;
  name?: string;
  thumbnail_url?: string;
  object_type?: string;
  object_story_spec?: {
    page_id?: string;
    instagram_actor_id?: string;
  };
};

export type GraphActionMetric = {
  action_type?: string;
  value?: string;
};

export type GraphInsightRow = {
  account_id?: string;
  account_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  inline_link_clicks?: string;
  outbound_clicks?: GraphActionMetric[];
  actions?: GraphActionMetric[];
  action_values?: GraphActionMetric[];
  [breakdown: string]: unknown;
};

export type GraphApiRequestMetadata = {
  method: "GET";
  path: string;
  params: Record<string, string>;
  requestId: string;
};
