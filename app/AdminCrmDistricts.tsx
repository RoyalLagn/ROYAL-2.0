import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";

export default function AdminCrmDistricts() {
  const router = useRouter();
  const { stateId, stateName } = useLocalSearchParams<{ stateId: string; stateName?: string }>();
  return (
    <TerritoryLevelScreen
      level="district"
      parentId={stateId ?? null}
      title={stateName || "Districts"}
      subtitle="Districts in this state"
      itemLabel="District"
      childLabel="Talukas"
      backRoute="/AdminCrmStates"
      onOpen={(node) => router.push({
        pathname: "/AdminCrmTalukas",
        params: { districtId: node.id, districtName: node.name },
      })}
    />
  );
}
