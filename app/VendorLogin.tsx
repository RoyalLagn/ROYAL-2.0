import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Legacy route — keep /VendorLogin working by forwarding to /VendorAuth.
 */
export default function VendorLoginRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ reset?: string; tab?: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/VendorAuth",
      params: {
        ...(params.reset ? { reset: String(params.reset) } : {}),
        ...(params.tab ? { tab: String(params.tab) } : {}),
      },
    });
  }, [params.reset, params.tab, router]);

  return <SafeAreaView className="flex-1 bg-background" />;
}
