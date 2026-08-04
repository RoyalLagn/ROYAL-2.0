import React from "react";
import { useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";

export default function AdminCrmStates() {
  const router = useRouter();
  return (
    <TerritoryLevelScreen
      level="state"
      parentId={null}
      title="States"
      subtitle="Vendor acquisition territory"
      itemLabel="State"
      childLabel="Districts"
      backRoute="/AdminCrm"
      onOpen={(node) => router.push({
        pathname: "/AdminCrmDistricts",
        params: { stateId: node.id, stateName: node.name },
      })}
    />
  );
}
