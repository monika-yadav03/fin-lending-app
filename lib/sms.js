import twilio from "twilio";

let cachedClient = null;
let cachedClientKey = "";

function createSmsError(message, statusCode = 500, code = "SMS_SEND_FAILED") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function isValidTwilioAccountSid(value) {
  return /^AC[0-9a-f]{32}$/i.test(String(value || "").trim());
}

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhoneNumber = process.env.TWILIO_FROM_PHONE;

  if (!accountSid || !authToken || !fromPhoneNumber) {
    return null;
  }

  if (!isValidTwilioAccountSid(accountSid)) {
    const error = new Error(
      "Invalid TWILIO_ACCOUNT_SID. Check .env.local and use the Twilio Account SID in format ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx."
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    accountSid,
    authToken,
    fromPhoneNumber,
  };
}

function getTwilioClient() {
  const config = getTwilioConfig();

  if (!config) {
    return null;
  }

  const clientKey = `${config.accountSid}:${config.authToken}`;

  if (!cachedClient || cachedClientKey !== clientKey) {
    cachedClient = twilio(config.accountSid, config.authToken);
    cachedClientKey = clientKey;
  }

  return {
    client: cachedClient,
    fromPhoneNumber: config.fromPhoneNumber,
  };
}

function normalizeSmsProviderError(error) {
  const providerMessage = String(error?.message || "Unable to send OTP.");
  const providerCode = String(error?.code || "").trim();
  const combinedText = `${providerMessage} ${providerCode}`.trim();

  if (/trial accounts cannot send messages to unverified numbers/i.test(combinedText)) {
    return createSmsError(
      "OTP could not be delivered. This SMS setup is using a Twilio trial account, which can only send to phone numbers verified in Twilio. Verify the recipient number in Twilio or upgrade the account and sender number.",
      400,
      "TWILIO_UNVERIFIED_RECIPIENT",
    );
  }

  if (/authenticate|authentication|username|password/i.test(combinedText) || providerCode === "20003") {
    return createSmsError(
      "OTP delivery is temporarily unavailable because the SMS provider credentials are invalid. Please contact support or try again later.",
      503,
      "TWILIO_AUTH_FAILED",
    );
  }

  if (/21606|not a valid message-capable twilio phone number/i.test(combinedText)) {
    return createSmsError(
      "OTP delivery is temporarily unavailable because the configured sender number cannot send SMS messages. Please contact support or try again later.",
      503,
      "TWILIO_INVALID_SENDER",
    );
  }

  if (/21211|21614|not a valid phone number|is not a mobile number/i.test(combinedText)) {
    return createSmsError(
      "Please enter a valid mobile number that can receive SMS OTP messages.",
      400,
      "TWILIO_INVALID_RECIPIENT",
    );
  }

  return createSmsError(
    providerMessage,
    Number(error?.statusCode) || Number(error?.status) || 500,
    providerCode || "SMS_SEND_FAILED",
  );
}

export async function sendOtpSms({ phoneNumber, otpCode }) {
  const twilioClient = getTwilioClient();
  const message = `Your FinLending OTP is ${otpCode}. It expires in 2 minutes.`;

  if (!twilioClient) {
    console.log(`[mock-sms] OTP for ${phoneNumber}: ${otpCode}`);
    return;
  }

  try {
    await twilioClient.client.messages.create({
      body: message,
      from: twilioClient.fromPhoneNumber,
      to: phoneNumber,
    });
  } catch (error) {
    throw normalizeSmsProviderError(error);
  }
}
