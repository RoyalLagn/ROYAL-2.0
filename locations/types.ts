export type SupportedArea = {
  id: string;
  cityId: string;
  name: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  pincodes?: string[];
};

export type SupportedCity = {
  id: string;
  name: string;
  state: string;
  slug: string;
  isActive: boolean;
  displayOrder: number;
  areas: SupportedArea[];
  pincodes?: string[];
};

export type LocationPreference = {
  cityId: string;
  areaId: string | null;
  pincode?: string | null;
};

export type VendorServiceLocation = {
  id?: string;
  vendorId: string;
  cityId: string;
  areaId: string | null;
  pincode: string | null;
  isPrimary: boolean;
  cityName: string;
  state: string;
  areaName: string | null;
};

export type LocationUsageCount = {
  kind: "city" | "area";
  id: string;
  vendorCount: number;
  customerCount: number;
};

export type PincodeLookupResult = {
  supported: boolean;
  found?: boolean;
  cached?: boolean;
  pincode: string;
  city?: { id: string; name: string; state: string } | null;
  area?: { id: string; name: string } | null;
  district?: string;
  state?: string;
  officeName?: string;
  provider?: string;
  detected?: { area?: string; city?: string; district?: string; state?: string };
  message?: string;
};

export type LocationRankableVendor = {
  serviceLocations?: VendorServiceLocation[];
  primaryCityId?: string | null;
  primaryAreaId?: string | null;
};
