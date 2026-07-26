export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (value: string) =>
  EMAIL_PATTERN.test(value.trim().toLowerCase());

export const validateFullName = (value: string) => value.trim().length > 0;

export const validatePhone = (value: string) =>
  /^\d{10,}$/.test(value.trim());

export const passwordRequirements = (value: string) => ({
  minimumLength: value.length >= 8,
  uppercase: /[A-Z]/.test(value),
  lowercase: /[a-z]/.test(value),
  number: /\d/.test(value),
});

export const validatePassword = (value: string) =>
  Object.values(passwordRequirements(value)).every(Boolean);
