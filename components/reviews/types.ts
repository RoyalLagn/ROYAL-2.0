import type { ImageSourcePropType } from "react-native";

export type ReviewStatus = "pending" | "published" | "rejected";

export type Review = {
  id: string;
  customerId: string;
  customerName: string;
  customerAvatar?: ImageSourcePropType | string | null;
  verifiedCustomer?: boolean;
  rating: number;
  title: string;
  text: string;
  photos?: (ImageSourcePropType | string)[];
  createdAt: string | Date;
  updatedAt?: string | Date;
  helpfulCount: number;
  isHelpful?: boolean;
  isOwner?: boolean;
  status?: ReviewStatus;
};

export type StarCounts = Record<1 | 2 | 3 | 4 | 5, number>;
export type ReviewSort = "recent" | "highest" | "lowest" | "helpful";
export type StarFilter = 1 | 2 | 3 | 4 | 5 | null;

export type ReviewDraft = {
  rating: number;
  title: string;
  text: string;
  photos: string[];
};

export type ReviewPalette = {
  surface: string;
  soft: string;
  text: string;
  muted: string;
  border: string;
  pink: string;
  gold: string;
};

export const reviewPalette = (dark: boolean): ReviewPalette => ({
  surface: dark ? "#211D1F" : "#FFFFFF",
  soft: dark ? "#2B2226" : "#FFF5F8",
  text: dark ? "#F9F2F5" : "#291D23",
  muted: dark ? "#BCAEB5" : "#786A71",
  border: dark ? "#4B343E" : "#F2D3DD",
  pink: dark ? "#F0659A" : "#DF356F",
  gold: "#E8A52F",
});

export const reviewImageSource = (
  image: ImageSourcePropType | string,
): ImageSourcePropType => (typeof image === "string" ? { uri: image } : image);
