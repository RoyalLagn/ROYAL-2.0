import React, { createContext, useContext, useMemo, useState } from "react";

export const SUPPORTED_LOCATIONS = [
  "Pune, Maharashtra",
  "Mumbai, Maharashtra",
  "Lonavala, Maharashtra",
  "Nashik, Maharashtra",
] as const;

type LocationContextValue = {
  location: string;
  city: string;
  setLocation: (location: string) => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<string>(SUPPORTED_LOCATIONS[0]);
  const value = useMemo(
    () => ({ location, city: location.split(",")[0], setLocation }),
    [location],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useCustomerLocation() {
  const context = useContext(LocationContext);
  if (!context) throw new Error("useCustomerLocation must be used inside LocationProvider");
  return context;
}
