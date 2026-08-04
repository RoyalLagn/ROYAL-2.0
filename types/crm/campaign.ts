export type CrmCampaignStatus = "active" | "completed" | "paused";

export type CrmCampaign = {
  id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  status: CrmCampaignStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmCampaignInput = {
  name: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: CrmCampaignStatus;
};
