import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";

export default function AdminCrmClusters() {
  const router = useRouter();
  const { talukaId, talukaName } = useLocalSearchParams<{ talukaId: string; talukaName?: string }>();
  return (
    <TerritoryLevelScreen
      level="cluster"
      parentId={talukaId ?? null}
      title={talukaName || "Clusters"}
      subtitle="Clusters in this taluka"
      itemLabel="Cluster"
      childLabel="Vendors"
      backRoute="/AdminCrm"
      onOpen={(node) => router.push({
        pathname: "/AdminCrmClusterCategories",
        params: { clusterId: node.id, clusterName: node.name },
      })}
    />
  );
}
