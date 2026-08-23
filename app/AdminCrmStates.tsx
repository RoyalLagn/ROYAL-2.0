import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";
import { listAdminGeoStates } from "@/services/geoLocations";

export default function AdminCrmStates() {
  const router = useRouter();
  const [stateOptions, setStateOptions] = useState<string[]>([]);
  useEffect(() => { void listAdminGeoStates().then((rows) => setStateOptions(rows.map((row) => row.name))).catch(() => setStateOptions([])); }, []);
  return (
    <TerritoryLevelScreen
      level="state"
      parentId={null}
      title="States"
      subtitle="Vendor acquisition territory"
      itemLabel="State"
      childLabel="Districts"
      backRoute="/AdminCrm"
      locationOptions={stateOptions}
      onOpen={(node) => router.push({
        pathname: "/AdminCrmDistricts",
        params: { stateId: node.id, stateName: node.name },
      })}
    />
  );
}
