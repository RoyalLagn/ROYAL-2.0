import React, { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { TerritoryLevelScreen } from "@/components/admin/crm/territory/TerritoryLevelScreen";
import { listAdminGeoDistricts, listAdminGeoStates } from "@/services/geoLocations";

export default function AdminCrmDistricts() {
  const router = useRouter();
  const { stateId, stateName } = useLocalSearchParams<{ stateId: string; stateName?: string }>();
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (!stateName) { setDistrictOptions([]); return; }
    void listAdminGeoStates()
      .then((states) => states.find((state) => state.name.trim().toLowerCase() === stateName.trim().toLowerCase()))
      .then((state) => state ? listAdminGeoDistricts(state.id) : [])
      .then((districts) => { if (!cancelled) setDistrictOptions(districts.map((district) => district.name)); })
      .catch(() => { if (!cancelled) setDistrictOptions([]); });
    return () => { cancelled = true; };
  }, [stateName]);
  return (
    <TerritoryLevelScreen
      level="district"
      parentId={stateId ?? null}
      title={stateName || "Districts"}
      subtitle="Districts in this state"
      itemLabel="District"
      childLabel="Talukas"
      backRoute="/AdminCrmStates"
      locationOptions={districtOptions}
      onOpen={(node) => router.push({
        pathname: "/AdminCrmTalukas",
        params: { districtId: node.id, districtName: node.name },
      })}
    />
  );
}
