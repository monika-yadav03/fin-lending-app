import twilio from "twilio";

let cachedClient = null;

function getTwilioConfig() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhoneNumber = process.env.TWILIO_FROM_PHONE;

  if (!accountSid || !authToken || !fromPhoneNumber) {
    return null;
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

  if (!cachedClient) {
    cachedClient = twilio(config.accountSid, config.authToken);
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
