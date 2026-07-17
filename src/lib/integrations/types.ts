export type RemoteCampaign = {
  externalId: string;
  name: string;
  status: string;
};

export type RemoteInsight = {
  campaignExternalId: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
};

export interface AdPlatformClient {
  listCampaigns(accountExternalId: string): Promise<RemoteCampaign[]>;
  getInsights(accountExternalId: string): Promise<RemoteInsight[]>;
  pauseCampaign(campaignExternalId: string): Promise<void>;
  resumeCampaign(campaignExternalId: string): Promise<void>;
  setDailyBudget(campaignExternalId: string, dailyBudget: number): Promise<void>;
}
