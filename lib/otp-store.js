import crypto from "node:crypto";

export const OTP_EXPIRY_MS = 2 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_RESEND_ATTEMPTS = 3;

const globalStore = globalThis;
const otpStore = globalStore.__finlendingOtpStore || new Map();

if (!globalStore.__finlendingOtpStore) {
  globalStore.__finlendingOtpStore = otpStore;
}

function generateOtpCode() {
  return `${crypto.randomInt(0, 1000000)}`.padStart(6, "0");
}

function getChallenge(phoneNumber) {
  const challenge = otpStore.get(phoneNumber);

  if (!challenge) {
    return null;
  }

  if (challenge.expiresAt <= Date.now()) {
    otpStore.delete(phoneNumber);
    return null;
  }

  return challenge;
}

function compareOtpCodes(expected, actual) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createOtpChallenge(phoneNumber) {
  const challenge = {
    phoneNumber,
    otpCode: generateOtpCode(),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    resendCount: 0,
    lastSentAt: Date.now(),
  };

  otpStore.set(phoneNumber, challenge);
  return challenge;
}

export function resendOtpChallenge(phoneNumber) {
  const challenge = getChallenge(phoneNumber);

  if (!challenge) {
    const error = new Error("OTP expired. Please request a new OTP.");
    error.statusCode = 400;
    throw error;
  }

  if (challenge.resendCount >= MAX_RESEND_ATTEMPTS) {
    const error = new Error("Resend limit reached. Please request a new OTP.");
    error.statusCode = 429;
    throw error;
  }

  const elapsed = Date.now() - challenge.lastSentAt;

  if (elapsed < RESEND_COOLDOWN_MS) {
    const secondsLeft = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    const error = new Error(`Please wait ${secondsLeft}s before resending OTP.`);
    error.statusCode = 429;
    error.retryAfterSeconds = secondsLeft;
    throw error;
  }

  const nextChallenge = {
    ...challenge,
    otpCode: generateOtpCode(),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    resendCount: challenge.resendCount + 1,
    lastSentAt: Date.now(),
  };

  otpStore.set(phoneNumber, nextChallenge);

  return {
    ...nextChallenge,
    remainingResends: Math.max(MAX_RESEND_ATTEMPTS - nextChallenge.resendCount, 0),
  };
}

export function verifyOtpCode({ phoneNumber, otpCode }) {
  const challenge = getChallenge(phoneNumber);

  if (!challenge) {
    const error = new Error("OTP expired. Please request a new OTP.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^\d{6}$/.test(otpCode) || !compareOtpCodes(challenge.otpCode, otpCode)) {
    const error = new Error("Incorrect OTP. Please try again.");
    error.statusCode = 401;
    throw error;
  }

  otpStore.delete(phoneNumber);

  return {
    verifiedAt: new Date().toISOString(),
  };
}
