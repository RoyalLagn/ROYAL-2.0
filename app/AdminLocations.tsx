import { Redirect } from "expo-router";

// Merged into /AdminGeoLocations (simple Taluka list + a collapsible
// "Advanced" section for the visibility switches and PIN review this page
// used to own). Kept as a redirect, not deleted, so any bookmarked or
// externally-linked /AdminLocations URL still lands somewhere useful.
export default function AdminLocationsRedirect() {
  return <Redirect href="/AdminGeoLocations" />;
}
