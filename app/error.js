"use client";

export default function Error({ error, reset }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <div className="auth-eyebrow">Something went wrong</div>
          <h1>Page could not be loaded</h1>
          <p>{error?.message || "An unexpected error occurred. Please try again."}</p>
        </div>
        <div className="auth-form">
          <button className="auth-submit" type="button" onClick={() => reset()}>
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
