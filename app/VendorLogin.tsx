import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Legacy route — keep /VendorLogin working by forwarding to the common auth screen.
 */
export default function VendorLoginRedirect() {
  const params = useLocalSearchParams<{ reset?: string; tab?: string }>();
  return <Redirect href={{
    pathname: "/Login",
    params: {
      ...(params.reset ? { reset: String(params.reset) } : {}),
      ...(params.tab === "signup" ? { tab: "signup" } : {}),
    },
  }} />;
}
