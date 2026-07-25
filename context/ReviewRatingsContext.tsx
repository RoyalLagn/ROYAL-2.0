import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  listReviewSummaries,
  subscribeToReviewAggregates,
  type ReviewSummary,
} from "@/services/reviews";

type RatingDisplay = { rating: number; reviews: number };
type ReviewRatingsValue = {
  summaries: Record<string, ReviewSummary>;
  getRating: (vendorKey: string, fallbackRating: number, fallbackReviews: number) => RatingDisplay;
  setSummary: (summary: ReviewSummary) => void;
};

const ReviewRatingsContext = createContext<ReviewRatingsValue | null>(null);

export function ReviewRatingsProvider({ children }: { children: React.ReactNode }) {
  const [summaries, setSummaries] = useState<Record<string, ReviewSummary>>({});

  const setSummary = useCallback((summary: ReviewSummary) => {
    setSummaries((current) => ({ ...current, [summary.vendor_key]: summary }));
  }, []);

  useEffect(() => {
    let mounted = true;
    listReviewSummaries()
      .then((rows) => mounted && setSummaries(rows))
      .catch(() => {
        // The app remains usable before the optional review migration is deployed.
      });
    const unsubscribe = subscribeToReviewAggregates(setSummary);
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [setSummary]);

  const getRating = useCallback(
    (vendorKey: string, fallbackRating: number, fallbackReviews: number) => {
      const summary = summaries[vendorKey];
      return summary?.review_count
        ? { rating: summary.average_rating, reviews: summary.review_count }
        : { rating: fallbackRating, reviews: fallbackReviews };
    },
    [summaries]
  );

  const value = useMemo(
    () => ({ summaries, getRating, setSummary }),
    [getRating, setSummary, summaries]
  );
  return <ReviewRatingsContext.Provider value={value}>{children}</ReviewRatingsContext.Provider>;
}

export function useReviewRatings() {
  const value = useContext(ReviewRatingsContext);
  if (!value) throw new Error("useReviewRatings must be used within ReviewRatingsProvider");
  return value;
}
