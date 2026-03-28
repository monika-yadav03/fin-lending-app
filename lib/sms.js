import twilio from "twilio";

let cachedClient = null;
let cachedClientKey = "";

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

export async function sendOtpSms({ phoneNumber, otpCode }) {
  const twilioClient = getTwilioClient();
  const message = `Your FinLending OTP is ${otpCode}. It expires in 2 minutes.`;

  if (!twilioClient) {
    console.log(`[mock-sms] OTP for ${phoneNumber}: ${otpCode}`);
    return;
  }

  await twilioClient.client.messages.create({
    body: message,
    from: twilioClient.fromPhoneNumber,
    to: phoneNumber,
  });
}
