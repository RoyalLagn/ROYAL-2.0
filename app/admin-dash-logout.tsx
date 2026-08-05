import { Redirect } from "expo-router";

/** Legacy route — admin profile now lives at `/AdminProfile`. */
export default function AdminDashLogoutRedirect() {
  return <Redirect href="/AdminProfile" />;
}
