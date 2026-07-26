import React, { createContext, useContext, useEffect, useState } from "react";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";

export type FavoriteVendor = {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviews: number;
  priceLevel: string;
  startingPrice: string;
  location: string;
  tags: string[];
  image: string;
};

type FavoritesContextType = {
  favorites: FavoriteVendor[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (vendor: FavoriteVendor) => void;
  removeFavorite: (id: string) => void;
};

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  isFavorite: () => false,
  toggleFavorite: () => {},
  removeFavorite: () => {},
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<FavoriteVendor[]>([]);

  useEffect(() => {
    let active = true;
    const synchronizeFavorites = () => {
      getApprovedPublicVendors()
        .then((vendors) => {
          if (!active) return;
          const liveById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
          setFavorites((current) =>
            current.flatMap((favorite) => {
              const live = liveById.get(favorite.id);
              return live ? [toFavoriteVendor(live)] : [];
            }),
          );
        })
        .catch(() => {
          // Keep the last known favorites while the live marketplace is unavailable.
        });
    };
    synchronizeFavorites();
    const unsubscribe = subscribeToPublicVendorChanges(synchronizeFavorites);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const isFavorite = (id: string) => favorites.some((v) => v.id === id);

  const toggleFavorite = (vendor: FavoriteVendor) => {
    setFavorites((prev) =>
      prev.some((v) => v.id === vendor.id)
        ? prev.filter((v) => v.id !== vendor.id)
        : [...prev, vendor]
    );
  };

  const removeFavorite = (id: string) =>
    setFavorites((prev) => prev.filter((v) => v.id !== id));

  return (
    <FavoritesContext.Provider value={{ favorites, isFavorite, toggleFavorite, removeFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

function toFavoriteVendor(vendor: PublicVendorListing): FavoriteVendor {
  return {
    id: vendor.id,
    name: vendor.name,
    category: vendor.category,
    rating: vendor.rating,
    reviews: vendor.reviews,
    priceLevel: vendor.priceLevel,
    startingPrice: vendor.startingPrice,
    location: vendor.location,
    tags: vendor.tags,
    image: vendor.image,
  };
}

export const useFavorites = () => useContext(FavoritesContext);
