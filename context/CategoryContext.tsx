import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CategoryService, type CategoryRecord } from "@/services/CategoryService";
import { MarketplaceConfig } from "@/services/MarketplaceConfig";

type CategoryContextValue = {
  categories: CategoryRecord[];
  homeCategories: CategoryRecord[];
  searchCategories: CategoryRecord[];
  registrationCategories: CategoryRecord[];
  loading: boolean;
  refresh: () => Promise<void>;
  findById: (id: string) => CategoryRecord | undefined;
  findBySlugOrName: (value: string) => CategoryRecord | undefined;
};

const CategoryContext = createContext<CategoryContextValue | null>(null);

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setCategories(await CategoryService.list({ force: true }));
    } catch {
      // Keep the last usable category snapshot when the marketplace is offline.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    CategoryService.list()
      .then((items) => {
        if (active) setCategories(items);
      })
      .catch(() => {
        // Category-dependent screens remain mounted and can recover via realtime.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = CategoryService.subscribe(() => {
      CategoryService.list({ force: true }).then((items) => {
        if (active) setCategories(items);
      }).catch(() => undefined);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<CategoryContextValue>(() => ({
    categories: MarketplaceConfig.visible(categories),
    homeCategories: MarketplaceConfig.home(categories),
    searchCategories: MarketplaceConfig.search(categories),
    registrationCategories: MarketplaceConfig.vendorRegistration(categories),
    loading,
    refresh,
    findById: (id) => categories.find((category) => category.id === id),
    findBySlugOrName: (candidate) => {
      const normalized = candidate.trim().toLowerCase();
      return categories.find((category) =>
        category.slug.toLowerCase() === normalized
        || category.name.toLowerCase() === normalized);
    },
  }), [categories, loading]);

  return <CategoryContext.Provider value={value}>{children}</CategoryContext.Provider>;
}

export function useCategories() {
  const value = useContext(CategoryContext);
  if (!value) throw new Error("useCategories must be used inside CategoryProvider.");
  return value;
}
