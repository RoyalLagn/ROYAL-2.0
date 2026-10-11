import assert from "node:assert/strict";

console.log("Starting Vendor Reviews Domain & Star Calculation Verification...");

// 1. Star Rating & Count Computation
function computeAverageRating(reviews) {
  if (!reviews || reviews.length === 0) return 0;
  const total = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0);
  return Number((total / reviews.length).toFixed(1));
}

function computeStarCounts(reviews) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of reviews) {
    const star = Math.max(1, Math.min(5, Math.round(Number(r.rating) || 0)));
    counts[star] = (counts[star] || 0) + 1;
  }
  return counts;
}

// Test sample dataset
const mockReviews = [
  { id: "r1", rating: 5, review: "Fantastic service!", helpful_count: 8, created_at: "2026-03-01T10:00:00Z" },
  { id: "r2", rating: 5, review: "Loved everything", helpful_count: 2, created_at: "2026-03-02T10:00:00Z" },
  { id: "r3", rating: 4, review: "Very good setup", helpful_count: 5, created_at: "2026-03-03T10:00:00Z" },
  { id: "r4", rating: 3, review: "Average experience", helpful_count: 0, created_at: "2026-03-04T10:00:00Z" },
  { id: "r5", rating: 1, review: "Terrible delay", helpful_count: 12, created_at: "2026-03-05T10:00:00Z" },
];

// Test Average Rating
const avg = computeAverageRating(mockReviews);
assert.equal(avg, 3.6, "Average rating should be 3.6 for [5, 5, 4, 3, 1]");

// Test Star Counts
const counts = computeStarCounts(mockReviews);
assert.deepEqual(counts, { 1: 1, 2: 0, 3: 1, 4: 1, 5: 2 }, "Star distribution counts match expected");

// Test Visual Stars Representation
function getStarDisplay(rating) {
  const roundedRating = Math.max(0, Math.min(5, Math.round(rating)));
  const filledStars = "★".repeat(roundedRating);
  const inactiveStars = "★".repeat(5 - roundedRating);
  return { filledStars, inactiveStars, total: filledStars + inactiveStars };
}

assert.equal(getStarDisplay(3.6).filledStars, "★★★★");
assert.equal(getStarDisplay(3.6).inactiveStars, "★");
assert.equal(getStarDisplay(5.0).filledStars, "★★★★★");
assert.equal(getStarDisplay(5.0).inactiveStars, "");
assert.equal(getStarDisplay(0).filledStars, "");
assert.equal(getStarDisplay(0).inactiveStars, "★★★★★");

// Test Star Filter
function filterReviews(reviews, starFilter) {
  if (starFilter === "all") return reviews;
  const targetStar = Number(starFilter);
  return reviews.filter((r) => Math.round(r.rating) === targetStar);
}

assert.equal(filterReviews(mockReviews, "all").length, 5);
assert.equal(filterReviews(mockReviews, "5").length, 2);
assert.equal(filterReviews(mockReviews, "4").length, 1);
assert.equal(filterReviews(mockReviews, "3").length, 1);
assert.equal(filterReviews(mockReviews, "2").length, 0);
assert.equal(filterReviews(mockReviews, "1").length, 1);

// Test Sort Order
function sortReviews(reviews, sortType) {
  const sorted = [...reviews];
  if (sortType === "recent") {
    return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  if (sortType === "highest") {
    return sorted.sort((a, b) => b.rating - a.rating);
  }
  if (sortType === "lowest") {
    return sorted.sort((a, b) => a.rating - b.rating);
  }
  if (sortType === "helpful") {
    return sorted.sort((a, b) => b.helpful_count - a.helpful_count);
  }
  return sorted;
}

assert.equal(sortReviews(mockReviews, "recent")[0].id, "r5"); // 2026-03-05
assert.equal(sortReviews(mockReviews, "highest")[0].rating, 5);
assert.equal(sortReviews(mockReviews, "lowest")[0].id, "r5"); // rating 1
assert.equal(sortReviews(mockReviews, "helpful")[0].id, "r5"); // 12 votes

// Test Realtime Update merging
function mergeRealtimeReview(existingReviews, updatedReview) {
  const index = existingReviews.findIndex((r) => r.id === updatedReview.id);
  if (index >= 0) {
    const next = [...existingReviews];
    next[index] = { ...next[index], ...updatedReview };
    return next;
  }
  return [updatedReview, ...existingReviews];
}

const newReview = { id: "r6", rating: 5, review: "Newly added realtime review!", helpful_count: 0, created_at: "2026-03-06T10:00:00Z" };
const updatedList = mergeRealtimeReview(mockReviews, newReview);
assert.equal(updatedList.length, 6);
assert.equal(updatedList[0].id, "r6");

// Updating existing review (e.g. customer edited rating or text)
const editedReview = { ...newReview, rating: 4, review: "Edited review text" };
const updatedList2 = mergeRealtimeReview(updatedList, editedReview);
assert.equal(updatedList2.length, 6);
assert.equal(updatedList2[0].rating, 4);
assert.equal(updatedList2[0].review, "Edited review text");

// Test 10-review Pagination Domain Logic
const PAGE_SIZE = 10;
function computePagination(total, page, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIndex = total === 0 ? 0 : page * pageSize + 1;
  const endIndex = Math.min((page + 1) * pageSize, total);
  const showPagination = total > pageSize;
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;
  return { totalPages, startIndex, endIndex, showPagination, hasPrev, hasNext };
}

// 7 reviews -> no pagination controls needed (all fit on page 1)
const p7 = computePagination(7, 0);
assert.equal(p7.showPagination, false, "7 reviews should not show pagination");
assert.equal(p7.totalPages, 1);
assert.equal(p7.startIndex, 1);
assert.equal(p7.endIndex, 7);

// 10 reviews -> exactly 1 page, no pagination controls
const p10 = computePagination(10, 0);
assert.equal(p10.showPagination, false, "10 reviews should not show pagination");
assert.equal(p10.totalPages, 1);

// 28 reviews -> 3 pages, pagination shown
const p28Page0 = computePagination(28, 0);
assert.equal(p28Page0.showPagination, true, "28 reviews should show pagination");
assert.equal(p28Page0.totalPages, 3);
assert.equal(p28Page0.startIndex, 1);
assert.equal(p28Page0.endIndex, 10);
assert.equal(p28Page0.hasPrev, false);
assert.equal(p28Page0.hasNext, true);

const p28Page1 = computePagination(28, 1);
assert.equal(p28Page1.startIndex, 11);
assert.equal(p28Page1.endIndex, 20);
assert.equal(p28Page1.hasPrev, true);
assert.equal(p28Page1.hasNext, true);

const p28Page2 = computePagination(28, 2);
assert.equal(p28Page2.startIndex, 21);
assert.equal(p28Page2.endIndex, 28);
assert.equal(p28Page2.hasPrev, true);
assert.equal(p28Page2.hasNext, false);

console.log("All Vendor Reviews domain, star calculation, and 10-item pagination verification tests passed successfully!");
