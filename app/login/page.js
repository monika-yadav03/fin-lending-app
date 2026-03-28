import { redirect } from "next/navigation";

import LoginForm from "../../components/login-form";
import { getSessionFromCookies } from "../../lib/auth";

export const metadata = {
  title: "Login | FinLending",
  description: "Login to FinLending with OTP",
};

export default async function LoginPage() {
  const session = await getSessionFromCookies();

  if (session) {
    redirect("/dashboard");
  }

  return <LoginForm />;
}
