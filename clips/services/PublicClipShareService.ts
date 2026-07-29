import { Share } from "react-native";
import * as Linking from "expo-linking";
import type { PublicClip } from "../types";

export function sharePublicClip(clip: PublicClip) {
  const url = Linking.createURL("/VendorsProfile", {
    queryParams: { vendorId: clip.vendor.id, clipId: clip.id },
  });
  return Share.share({
    title: `RoyalLagn Clip · ${clip.vendor.name}`,
    message: `${clip.title}\n\nDiscover ${clip.vendor.name} on RoyalLagn.\n${url}`,
    url,
  });
}
