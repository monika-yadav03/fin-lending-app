"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body>
        <div className="auth-shell">
          <div className="auth-card">
            <div className="auth-copy">
              <div className="auth-eyebrow">Application error</div>
              <h1>FinLending temporarily unavailable</h1>
              <p>
                {error?.message ||
                  "An unexpected application error occurred. Please retry."}
              </p>
            </div>
            <div className="auth-form">
              <button
                className="auth-submit"
                type="button"
                onClick={() => reset()}
              >
                Reload app
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
