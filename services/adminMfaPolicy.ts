/**
 * The MFA bypass is available only in a development bundle and must also be
 * opted into explicitly. Production builds always require the second factor,
 * even if a public environment value is accidentally carried into the build.
 */
export const ADMIN_MFA_DEV_BYPASS_ENABLED =
  __DEV__ && process.env.EXPO_PUBLIC_ADMIN_MFA_DEV_BYPASS === "true";
