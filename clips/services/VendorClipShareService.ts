import { Share } from "react-native";
import * as Linking from "expo-linking";

export function shareVendorClip(input: {
  id: string;
  title: string;
  vendorId: string;
  vendorName: string;
}) {
  const url = Linking.createURL("/VendorsProfile", {
    queryParams: { vendorId: input.vendorId, clipId: input.id },
  });
  return Share.share({
    title: `${input.title} · RoyalLagn`,
    message: `${input.title}\n\nDiscover ${input.vendorName} on RoyalLagn.\n${url}`,
    url,
  });
}
