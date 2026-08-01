export function subscriptionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function isSubscriptionSchemaMissing(error: unknown) {
  const message = subscriptionErrorMessage(error, "");
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
  return /schema cache|could not find (the )?(table|function)|relation .* does not exist|PGRST20[245]/i.test(`${code} ${message}`);
}

