import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

export const SESSION_COOKIE_NAME = "finlending_session";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is missing. Set it in .env.local.");
  }

  return secret;
}

export function createSessionToken(payload) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: "1d",
    issuer: "finlending",
  });
}

export function verifySessionToken(token) {
  try {
    return jwt.verify(token, getJwtSecret(), {
      issuer: "finlending",
    });
  } catch {
    return null;
  }
}

export async function getSessionFromCookies() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}
