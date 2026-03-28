import { NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ success: true });

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
