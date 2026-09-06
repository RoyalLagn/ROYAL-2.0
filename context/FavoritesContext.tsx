import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useReducedMotion } from "react-native-reanimated";
import FavoriteFlyOverlay, {
  type FavoriteFlight,
} from "@/components/favorites/FavoriteFlyOverlay";
import {
  getApprovedPublicVendors,
  subscribeToPublicVendorChanges,
  type PublicVendorListing,
} from "@/services/publicVendorListings";
import { supabase } from "@/services/supabase";
import { usePublicAuth } from "@/context/PublicAuthContext";

const GUEST_FAVORITES_STORAGE_KEY = "royallagn.favorites.guest.v1";
const favoritesStorageKey = (profileId: string | null) =>
  profileId ? `royallagn.favorites.${profileId}.v1` : GUEST_FAVORITES_STORAGE_KEY;

async function loadStoredFavoriteIds(profileId: string | null): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(favoritesStorageKey(profileId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function persistFavoriteIds(profileId: string | null, ids: string[]) {
  try {
    await AsyncStorage.setItem(favoritesStorageKey(profileId), JSON.stringify(ids));
  } catch {
    // Best-effort local cache only -- Supabase (for signed-in users) remains the durable copy.
  }
}

export type FavoriteVendor = {
  id: string;
  slug?: string;
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

export type FavoriteMeasureNode = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type FavoriteSourceRef = React.RefObject<FavoriteMeasureNode | null>;
export type FavoriteToggleResult = "added" | "removed" | "ignored";

type FavoritesContextType = {
  favorites: FavoriteVendor[];
  loading: boolean;
  hasUnviewedFavorites: boolean;
  favoriteIndicatorToken: number;
  favoriteArrivalToken: number;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (
    vendor: FavoriteVendor,
    source?: FavoriteSourceRef,
  ) => FavoriteToggleResult;
  removeFavorite: (id: string) => void;
  markFavoritesViewed: () => void;
  registerFavoritesDestination: (node: FavoriteMeasureNode | null) => void;
};

const FavoritesContext = createContext<FavoritesContextType>({
  favorites: [],
  loading: true,
  hasUnviewedFavorites: false,
  favoriteIndicatorToken: 0,
  favoriteArrivalToken: 0,
  isFavorite: () => false,
  toggleFavorite: () => "ignored",
  removeFavorite: () => {},
  markFavoritesViewed: () => {},
  registerFavoritesDestination: () => {},
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { session } = usePublicAuth();
  const profileId = session?.user.id ?? null;
  const [favorites, setFavorites] = useState<FavoriteVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnviewedFavorites, setHasUnviewedFavorites] = useState(false);
  const [favoriteIndicatorToken, setFavoriteIndicatorToken] = useState(0);
  const [favoriteArrivalToken, setFavoriteArrivalToken] = useState(0);
  const [flight, setFlight] = useState<FavoriteFlight | null>(null);
  const favoritesRef = useRef<FavoriteVendor[]>([]);
  const destinationRef = useRef<FavoriteMeasureNode | null>(null);
  const mutationLocks = useRef(new Set<string>());
  const flightActive = useRef(false);
  const flightId = useRef(0);
  const reducedMotion = useReducedMotion();
  const profileIdRef = useRef<string | null>(profileId);
  const hydratedRef = useRef(false);
  profileIdRef.current = profileId;

  // Hydrates favorites for the active identity (signed-in profile, or the
  // shared guest bucket) from AsyncStorage, reconciles them against
  // Supabase's `favorites` table when signed in (pushing up any ids that
  // only exist locally -- e.g. favorites added as a guest before login),
  // then resolves each id against the live marketplace so stale/unapproved
  // vendors never show up. Re-runs whenever the signed-in identity changes.
  useEffect(() => {
    let active = true;
    setLoading(true);
    hydratedRef.current = false;
    (async () => {
      const storedIds = await loadStoredFavoriteIds(profileId);
      if (!active) return;
      let mergedIds = storedIds;

      if (profileId) {
        try {
          const { data, error } = await supabase
            .from("favorites")
            .select("vendor_id")
            .eq("profile_id", profileId);
          if (!active) return;
          if (!error) {
            const remoteIds = (data ?? []).map((row) => row.vendor_id);
            const remoteSet = new Set(remoteIds);
            const localOnly = storedIds.filter((id) => !remoteSet.has(id));
            if (localOnly.length) {
              await supabase
                .from("favorites")
                .insert(localOnly.map((vendorId) => ({ profile_id: profileId, vendor_id: vendorId })))
                .then(() => undefined, () => undefined);
            }
            mergedIds = Array.from(new Set([...remoteIds, ...storedIds]));
          }
        } catch {
          // Supabase unreachable -- fall back to the locally cached ids.
        }
      }

      try {
        const vendors = await getApprovedPublicVendors();
        if (!active) return;
        const liveById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
        const next = mergedIds.flatMap((id) => {
          const live = liveById.get(id);
          return live ? [toFavoriteVendor(live)] : [];
        });
        favoritesRef.current = next;
        setFavorites(next);
      } catch {
        // Live marketplace unavailable -- keep whatever was already showing.
      } finally {
        hydratedRef.current = true;
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [profileId]);

  // Keeps favorites in sync as the live marketplace changes (e.g. a vendor
  // is unapproved) without re-reading from storage/Supabase each time.
  useEffect(() => {
    const synchronizeFavorites = () => {
      getApprovedPublicVendors()
        .then((vendors) => {
          const liveById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
          setFavorites((current) => {
            const next = current.flatMap((favorite) => {
              const live = liveById.get(favorite.id);
              return live ? [toFavoriteVendor(live)] : [];
            });
            favoritesRef.current = next;
            return next;
          });
        })
        .catch(() => {
          // Keep the last known favorites while the live marketplace is unavailable.
        });
    };
    const unsubscribe = subscribeToPublicVendorChanges(synchronizeFavorites);
    return unsubscribe;
  }, []);

  // Persists the current favorite ids to the active identity's local bucket
  // so they survive an app restart or page refresh -- Supabase remains the
  // durable, cross-device copy for signed-in users, but local storage keeps
  // things working offline and for guests who never sign in.
  useEffect(() => {
    if (!hydratedRef.current) return;
    void persistFavoriteIds(profileId, favorites.map((favorite) => favorite.id));
  }, [favorites, profileId]);

  const isFavorite = useCallback(
    (id: string) => favorites.some((favorite) => favorite.id === id),
    [favorites],
  );

  const registerFavoritesDestination = useCallback((node: FavoriteMeasureNode | null) => {
    if (node) destinationRef.current = node;
  }, []);

  const completeArrivalFeedback = useCallback(() => {
    setFavoriteArrivalToken((current) => current + 1);
  }, []);

  const startFavoriteFlight = useCallback((source?: FavoriteSourceRef) => {
    if (reducedMotion || flightActive.current) {
      completeArrivalFeedback();
      return;
    }

    const sourceNode = source?.current;
    const destinationNode = destinationRef.current;
    if (!sourceNode || !destinationNode) {
      completeArrivalFeedback();
      return;
    }

    sourceNode.measureInWindow((sourceX, sourceY, sourceWidth, sourceHeight) => {
      destinationNode.measureInWindow((destinationX, destinationY, destinationWidth, destinationHeight) => {
        if (
          sourceWidth <= 0
          || sourceHeight <= 0
          || destinationWidth <= 0
          || destinationHeight <= 0
        ) {
          completeArrivalFeedback();
          return;
        }

        flightActive.current = true;
        const id = ++flightId.current;
        setFlight({
          id,
          startX: sourceX + sourceWidth / 2,
          startY: sourceY + sourceHeight / 2,
          endX: destinationX + destinationWidth / 2,
          endY: destinationY + destinationHeight / 2,
        });
      });
    });
  }, [completeArrivalFeedback, reducedMotion]);

  const finishFavoriteFlight = useCallback((completedId: number) => {
    if (flightId.current !== completedId) return;
    flightActive.current = false;
    setFlight(null);
    completeArrivalFeedback();
  }, [completeArrivalFeedback]);

  const toggleFavorite = useCallback((
    vendor: FavoriteVendor,
    source?: FavoriteSourceRef,
  ): FavoriteToggleResult => {
    if (mutationLocks.current.has(vendor.id)) return "ignored";
    mutationLocks.current.add(vendor.id);

    const exists = favoritesRef.current.some((favorite) => favorite.id === vendor.id);
    const next = exists
      ? favoritesRef.current.filter((favorite) => favorite.id !== vendor.id)
      : [...favoritesRef.current, vendor];

    favoritesRef.current = next;
    setFavorites(next);

    if (!exists) {
      startFavoriteFlight(source);
      setHasUnviewedFavorites((current) => {
        if (!current) setFavoriteIndicatorToken((token) => token + 1);
        return true;
      });
    }

    const syncingProfileId = profileIdRef.current;
    if (syncingProfileId) {
      const write = exists
        ? supabase.from("favorites").delete().eq("profile_id", syncingProfileId).eq("vendor_id", vendor.id)
        : supabase.from("favorites").insert({ profile_id: syncingProfileId, vendor_id: vendor.id });
      void write.then(() => undefined, () => undefined);
    }

    setTimeout(() => {
      mutationLocks.current.delete(vendor.id);
    }, 450);

    return exists ? "removed" : "added";
  }, [startFavoriteFlight]);

  const removeFavorite = useCallback((id: string) => {
    const next = favoritesRef.current.filter((favorite) => favorite.id !== id);
    favoritesRef.current = next;
    setFavorites(next);

    const syncingProfileId = profileIdRef.current;
    if (syncingProfileId) {
      void supabase.from("favorites").delete().eq("profile_id", syncingProfileId).eq("vendor_id", id)
        .then(() => undefined, () => undefined);
    }
  }, []);

  const markFavoritesViewed = useCallback(() => {
    setHasUnviewedFavorites(false);
  }, []);

  const value = useMemo<FavoritesContextType>(() => ({
    favorites,
    loading,
    hasUnviewedFavorites,
    favoriteIndicatorToken,
    favoriteArrivalToken,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    markFavoritesViewed,
    registerFavoritesDestination,
  }), [
    favoriteArrivalToken,
    favoriteIndicatorToken,
    favorites,
    loading,
    hasUnviewedFavorites,
    isFavorite,
    markFavoritesViewed,
    registerFavoritesDestination,
    removeFavorite,
    toggleFavorite,
  ]);

  return (
    <FavoritesContext.Provider value={value}>
      <View style={styles.root} collapsable={false}>
        {children}
        <FavoriteFlyOverlay flight={flight} onComplete={finishFavoriteFlight} />
      </View>
    </FavoritesContext.Provider>
  );
}

function toFavoriteVendor(vendor: PublicVendorListing): FavoriteVendor {
  return {
    id: vendor.id,
    slug: vendor.slug,
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    position: "relative",
  },
});
