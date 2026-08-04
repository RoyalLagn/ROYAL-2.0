export type TerritoryLevel = "state" | "district" | "taluka" | "cluster";

export type CrmTerritoryNode = {
  id: string;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
  parent_id: string | null;
  child_count: number;
  vendor_count: number;
  registered_count: number;
};

export const territoryCompletion = (node: CrmTerritoryNode) =>
  node.vendor_count > 0 ? Math.round((node.registered_count / node.vendor_count) * 100) : 0;

export const territoryLevelLabels: Record<TerritoryLevel, { singular: string; plural: string; childLabel: string }> = {
  state: { singular: "State", plural: "States", childLabel: "Districts" },
  district: { singular: "District", plural: "Districts", childLabel: "Talukas" },
  taluka: { singular: "Taluka", plural: "Talukas", childLabel: "Clusters" },
  cluster: { singular: "Cluster", plural: "Clusters", childLabel: "Vendors" },
};

export type CrmTerritoryInput = {
  name: string;
  slug: string;
  displayOrder?: number;
  isActive?: boolean;
};

export const territoryChildLevel: Record<TerritoryLevel, TerritoryLevel | null> = {
  state: "district",
  district: "taluka",
  taluka: "cluster",
  cluster: null,
};

export const territoryParentColumn: Record<Exclude<TerritoryLevel, "state">, string> = {
  district: "state_id",
  taluka: "district_id",
  cluster: "taluka_id",
};

export const territoryTable: Record<TerritoryLevel, string> = {
  state: "crm_states",
  district: "crm_districts",
  taluka: "crm_talukas",
  cluster: "crm_clusters",
};
