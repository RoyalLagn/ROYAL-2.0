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
import { useReducedMotion } from "react-native-reanimated";
import FavoriteFlyOverlay, {
  type FavoriteFlight,
} from "@/components/favorites/FavoriteFlyOverlay";
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

export type FavoriteMeasureNode = {
  measureInWindow: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

export type FavoriteSourceRef = React.RefObject<FavoriteMeasureNode | null>;
export type FavoriteToggleResult = "added" | "removed" | "ignored";

type FavoritesContextType = {
  favorites: FavoriteVendor[];
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
  const [favorites, setFavorites] = useState<FavoriteVendor[]>([]);
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

  useEffect(() => {
    let active = true;
    const synchronizeFavorites = () => {
      getApprovedPublicVendors()
        .then((vendors) => {
          if (!active) return;
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
    synchronizeFavorites();
    const unsubscribe = subscribeToPublicVendorChanges(synchronizeFavorites);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

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

    setTimeout(() => {
      mutationLocks.current.delete(vendor.id);
    }, 450);

    return exists ? "removed" : "added";
  }, [startFavoriteFlight]);

  const removeFavorite = useCallback((id: string) => {
    const next = favoritesRef.current.filter((favorite) => favorite.id !== id);
    favoritesRef.current = next;
    setFavorites(next);
  }, []);

  const markFavoritesViewed = useCallback(() => {
    setHasUnviewedFavorites(false);
  }, []);

  const value = useMemo<FavoritesContextType>(() => ({
    favorites,
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
