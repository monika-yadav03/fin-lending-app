import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-copy">
          <div className="auth-eyebrow">404</div>
          <h1>Page not found</h1>
          <p>
            The page you were trying to open is not available. Let's go back
            to the dashboard or login.
          </p>
        </div>
        <div className="auth-form">
          <Link className="auth-submit" href="/login">
            Go to login
          </Link>
        </div>
      </div>
    </div>
  );
}
