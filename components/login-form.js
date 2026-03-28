"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const RESEND_SECONDS = 60;

function formatPhoneInput(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 5) {
    return digits;
  }

  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export default function LoginForm() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [step, setStep] = useState("phone");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [remainingResends, setRemainingResends] = useState(3);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (secondsLeft <= 0) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  const otpValue = useMemo(() => otp.join(""), [otp]);

  function updateOtpAt(index, value) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setOtp((current) => {
      const next = [...current];
      next[index] = digit;
      return next;
    });

    if (digit && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, event) {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  async function sendOtp(event) {
    event?.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: `+91${phoneNumber.replace(/\D/g, "")}` }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "OTP send failed.");
      }

      setNormalizedPhone(data.phoneNumber);
      setStep("otp");
      setOtp(["", "", "", "", "", ""]);
      setMessage(`OTP sent to ${data.phoneNumber}`);
      setSecondsLeft(RESEND_SECONDS);
      setRemainingResends(3);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp(event) {
    event.preventDefault();
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: normalizedPhone,
          otpCode: otpValue,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "OTP verification failed.");
      }

      router.replace(data.redirectTo || "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (resendLoading || secondsLeft > 0 || remainingResends <= 0) {
      return;
    }

    setResendLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber: normalizedPhone,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data?.retryAfterSeconds) {
          setSecondsLeft(data.retryAfterSeconds);
        }
        throw new Error(data?.error || "Unable to resend OTP.");
      }

      setOtp(["", "", "", "", "", ""]);
      setSecondsLeft(RESEND_SECONDS);
      setRemainingResends(data.remainingResends);
      setMessage(`New OTP sent to ${data.phoneNumber}`);
      requestAnimationFrame(() => inputRefs.current[0]?.focus());
    } catch (err) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <div className="auth-eyebrow">Secure Login</div>
          <h1>Log in to FinLending</h1>
          <p>
            Enter your mobile number. Once your OTP is verified, you will be
            redirected to your dashboard.
          </p>
        </div>

        <form className="auth-form" onSubmit={step === "phone" ? sendOtp : verifyOtp}>
          <label htmlFor="phone">Mobile Number</label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            placeholder="+91 98765 43210"
            value={formatPhoneInput(phoneNumber)}
            onChange={(event) => setPhoneNumber(event.target.value)}
            disabled={step === "otp"}
          />

          {step === "otp" ? (
            <>
              <label>Enter 6-digit OTP</label>
              <div className="otp-group">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      inputRefs.current[index] = element;
                    }}
                    className="otp-box"
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(event) => updateOtpAt(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(index, event)}
                  />
                ))}
              </div>
              <div className="auth-row">
                <button
                  type="button"
                  className="auth-link"
                  disabled={secondsLeft > 0 || remainingResends <= 0 || resendLoading}
                  onClick={resendOtp}
                >
                  {resendLoading
                    ? "Resending..."
                    : secondsLeft > 0
                      ? `Resend in ${secondsLeft}s`
                      : remainingResends > 0
                        ? `Resend OTP (${remainingResends} left)`
                        : "Resend limit reached"}
                </button>
                <button
                  type="button"
                  className="auth-link"
                  onClick={() => {
                    setStep("phone");
                    setOtp(["", "", "", "", "", ""]);
                    setNormalizedPhone("");
                    setSecondsLeft(0);
                    setRemainingResends(3);
                    setMessage("");
                    setError("");
                  }}
                >
                  Change number
                </button>
              </div>
            </>
          ) : null}

          {error ? <div className="auth-error">{error}</div> : null}
          {message ? <div className="auth-success">{message}</div> : null}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? step === "phone"
                ? "Sending OTP..."
                : "Verifying OTP..."
              : step === "phone"
                ? "Send OTP"
                : "Verify OTP"}
          </button>
        </form>
      </div>
    </div>
  );
}
