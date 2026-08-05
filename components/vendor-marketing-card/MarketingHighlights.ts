// Fixed, per-category marketing highlights for the Vendor Marketing Card.
// Vendors never choose or edit these -- every vendor in a category gets the
// same four highlights, keeping the card's design identical for everyone
// (see app/vendor-marketing-card.tsx). Keys are normalized (trimmed,
// lower-cased) category names so lookups are resilient to casing.

const CATEGORY_HIGHLIGHTS: Record<string, [string, string, string, string]> = {
  photographer: ["Candid Photography", "Cinematic Videography", "Drone Shoot", "Album Designing"],
  photographers: ["Candid Photography", "Cinematic Videography", "Drone Shoot", "Album Designing"],
  "makeup artist": ["Bridal Makeup", "HD Makeup", "Airbrush Makeup", "Party Makeup"],
  "makeup artists": ["Bridal Makeup", "HD Makeup", "Airbrush Makeup", "Party Makeup"],
  "mehendi artist": ["Bridal Mehendi", "Arabic Designs", "Engagement Mehendi", "Family Mehendi"],
  "mehndi artists": ["Bridal Mehendi", "Arabic Designs", "Engagement Mehendi", "Family Mehendi"],
  decorator: ["Wedding Decoration", "Floral Decoration", "Theme Decoration", "Stage Decoration"],
  decorators: ["Wedding Decoration", "Floral Decoration", "Theme Decoration", "Stage Decoration"],
  dj: ["DJ Setup", "Professional Sound", "Lighting Effects", "Dance Floor"],
  djs: ["DJ Setup", "Professional Sound", "Lighting Effects", "Dance Floor"],
  caterer: ["Veg Menu", "Multi Cuisine", "Live Counters", "Beverage Service"],
  caterers: ["Veg Menu", "Multi Cuisine", "Live Counters", "Beverage Service"],
  "wedding planner": ["Wedding Planning", "Event Coordination", "Venue Management", "Guest Management"],
  "wedding hall": ["Banquet Halls", "Lawn & Outdoor Venues", "In-house Catering", "Guest Accommodation"],
  venues: ["Banquet Halls", "Lawn & Outdoor Venues", "In-house Catering", "Guest Accommodation"],
  "bridal wear": ["Designer Lehengas", "Custom Fitting", "Latest Collections", "Rental & Purchase"],
  "groom wear": ["Sherwanis & Suits", "Custom Fitting", "Latest Collections", "Rental & Purchase"],
  jewellery: ["Bridal Sets", "Gold & Diamond", "Rental Options", "Custom Designs"],
  "jewellery & accessories": ["Bridal Sets", "Gold & Diamond", "Rental Options", "Custom Designs"],
  "invitation cards": ["Custom Invites", "Digital Invites", "Premium Printing", "Express Delivery"],
  "invites & cards": ["Custom Invites", "Digital Invites", "Premium Printing", "Express Delivery"],
  pandit: ["Vedic Rituals", "Muhurat Guidance", "Multi-language Ceremonies", "Home Visits"],
  pandits: ["Vedic Rituals", "Muhurat Guidance", "Multi-language Ceremonies", "Home Visits"],
  choreographer: ["Sangeet Choreography", "Couple Dance", "Group Performances", "Rehearsal Sessions"],
  "music & dance": ["Sangeet Choreography", "Couple Dance", "Group Performances", "Rehearsal Sessions"],
  "live orchestra & band": ["Live Band Performance", "Baraat Music", "Custom Song Requests", "Sound Setup"],
  "pre wedding shoot": ["Candid Pre-Wedding", "Destination Shoots", "Cinematic Films", "Styled Concepts"],
  "car rental": ["Wedding Car Decoration", "Luxury Fleet", "Doli & Convoy", "On-time Service"],
  travel: ["Honeymoon Packages", "Guest Travel Planning", "Group Bookings", "Custom Itineraries"],
};

// A safe, category-agnostic fallback so a vendor in an uncatalogued or
// future category still gets four highlights instead of a blank card.
const DEFAULT_HIGHLIGHTS: [string, string, string, string] = [
  "Trusted by Couples",
  "Verified Vendor",
  "Premium Service",
  "On-time Delivery",
];

export function getMarketingHighlights(category: string | null | undefined): [string, string, string, string] {
  const key = category?.trim().toLowerCase() ?? "";
  return CATEGORY_HIGHLIGHTS[key] ?? DEFAULT_HIGHLIGHTS;
}
