export const phoneRegex = /^\d{10}$/;

export function sanitizePhone(value) {
  return `${value || ""}`.trim().replace(/\D/g, "").slice(0, 10);
}

export function isValidPhone(value) {
  return phoneRegex.test(sanitizePhone(value));
}

export function toIndianE164(value) {
  const phoneNumber = sanitizePhone(value);

  if (!phoneRegex.test(phoneNumber)) {
    const error = new Error("Please enter a valid mobile number");
    error.statusCode = 400;
    throw error;
  }

  return `+91${phoneNumber}`;
}
