import { NextResponse } from "next/server";

import { normalizeIndianPhoneNumber } from "../../../lib/phone";
import { createOtpChallenge, OTP_EXPIRY_MS } from "../../../lib/otp-store";
import { sendOtpSms } from "../../../lib/sms";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const body = await request.json();
    const phoneNumber = normalizeIndianPhoneNumber(body?.phoneNumber);
    const challenge = createOtpChallenge(phoneNumber);

    await sendOtpSms({
      phoneNumber,
      otpCode: challenge.otpCode,
    });

    return NextResponse.json({
      success: true,
      phoneNumber,
      expiresIn: Math.floor(OTP_EXPIRY_MS / 1000),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to send OTP.",
      },
      { status: error?.statusCode || 400 },
    );
  }
}
