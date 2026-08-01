export type PackageValidationInput = {
  title: string;
  price_type: "starting" | "fixed" | "contact";
  price: number | null;
  discounted_price: number | null;
  events_covered: number | null;
  items: Array<{ title: string; item_type: "included" | "excluded" | "add_on"; price?: number | null }>;
};

export function validateVendorPackage(input: PackageValidationInput) {
  const errors: string[] = [];
  const title = input.title.trim();
  if (title.length < 2 || title.length > 120) errors.push("Package name must contain 2 to 120 characters.");
  if (input.price_type !== "contact") {
    if (input.price == null || !Number.isFinite(input.price) || input.price < 0) errors.push("Enter a valid non-negative package price.");
  }
  if (input.discounted_price != null && (
    !Number.isFinite(input.discounted_price)
    || input.discounted_price < 0
    || input.price == null
    || input.discounted_price >= input.price
  )) errors.push("Offer price must be lower than the regular price.");
  if (input.events_covered != null && (!Number.isInteger(input.events_covered) || input.events_covered < 1)) {
    errors.push("Events covered must be a whole number of at least one.");
  }
  if (input.items.length > 80) errors.push("A package can contain at most 80 service items.");
  if (input.items.some((item) => !item.title.trim())) errors.push("Every included service, exclusion and add-on requires a name.");
  if (input.items.some((item) => item.item_type === "add_on" && item.price != null && (!Number.isFinite(item.price) || item.price < 0))) {
    errors.push("Add-on prices must be zero or greater.");
  }
  return errors;
}
