import { NextResponse } from "next/server";

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../lib/auth";
import { normalizeIndianPhoneNumber } from "../../../lib/phone";
import { verifyOtpCode } from "../../../lib/otp-store";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const phoneNumber = normalizeIndianPhoneNumber(body?.phoneNumber);
    const otpCode = String(body?.otpCode || "");
    const verification = verifyOtpCode({ phoneNumber, otpCode });
    const token = createSessionToken({
      phoneNumber,
      verifiedAt: verification.verifiedAt,
    });

    const response = NextResponse.json({
      success: true,
      redirectTo: "/dashboard",
    });

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "OTP verification failed.",
      },
      { status: error?.statusCode || 400 },
    );
  }
}
