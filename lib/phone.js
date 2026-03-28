export const phoneRegex = /^\d{10}$/;

export function sanitizePhone(value) {
  return `${value || ""}`.trim().replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(value) {
  return phoneRegex.test(sanitizePhone(value));
}

export function toIndianE164(value) {
  const phoneNumber = sanitizePhone(value);

  if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
    const error = new Error("Please enter a valid mobile number");
    error.statusCode = 400;
    throw error;
  }

  return `+91${phoneNumber}`;
}

export function normalizeIndianPhoneNumber(value) {
  const digits = `${value || ""}`.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return toIndianE164(digits.slice(2));
  }

  if (digits.length === 13 && digits.startsWith("091")) {
    return toIndianE164(digits.slice(3));
  }

  return toIndianE164(digits);
}
