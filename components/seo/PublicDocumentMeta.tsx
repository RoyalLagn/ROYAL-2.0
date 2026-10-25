import { useEffect } from "react";
import { Platform } from "react-native";
import { useGlobalSearchParams, usePathname } from "expo-router";
import { syncPublicDocument } from "@/lib/seo/documentMeta";

/** Updates document metadata on web. It renders nothing. */
export default function PublicDocumentMeta() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ query?: string | string[] }>();
  const searchQuery = Array.isArray(params.query) ? params.query[0] ?? "" : params.query ?? "";

  useEffect(() => {
    if (Platform.OS !== "web") return;
    syncPublicDocument(pathname, searchQuery);
  }, [pathname, searchQuery]);

  return null;
}
