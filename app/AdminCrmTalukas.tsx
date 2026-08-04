import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";

export default function AdminCrmTalukas() {
  const router = useRouter();
  const { districtId, districtName } = useLocalSearchParams<{ districtId: string; districtName?: string }>();
  return (
    <TerritoryLevelScreen
      level="taluka"
      parentId={districtId ?? null}
      title={districtName || "Talukas"}
      subtitle="Talukas in this district"
      itemLabel="Taluka"
      childLabel="Clusters"
      backRoute="/AdminCrm"
      onOpen={(node) => router.push({
        pathname: "/AdminCrmClusters",
        params: { talukaId: node.id, talukaName: node.name },
      })}
    />
  );
}
