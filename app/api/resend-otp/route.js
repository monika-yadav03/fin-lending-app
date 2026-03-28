import { NextResponse } from "next/server";

import { normalizeIndianPhoneNumber } from "../../../lib/phone";
import { resendOtpChallenge, OTP_EXPIRY_MS } from "../../../lib/otp-store";
import { sendOtpSms } from "../../../lib/sms";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const phoneNumber = normalizeIndianPhoneNumber(body?.phoneNumber);
    const challenge = resendOtpChallenge(phoneNumber);

    await sendOtpSms({
      phoneNumber,
      otpCode: challenge.otpCode,
    });

    return NextResponse.json({
      success: true,
      phoneNumber,
      expiresIn: Math.floor(OTP_EXPIRY_MS / 1000),
      remainingResends: challenge.remainingResends,
    });
  } catch (error) {
    const payload = {
      success: false,
      error: error?.message || "Unable to resend OTP.",
    };

    if (typeof error?.retryAfterSeconds === "number") {
      payload.retryAfterSeconds = error.retryAfterSeconds;
    }

    return NextResponse.json(payload, {
      status: error?.statusCode || 400,
    });
  }
}
