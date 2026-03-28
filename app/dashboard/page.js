import { redirect } from "next/navigation";

import FinLendingApp from "../../components/finlending-app";
import { getSessionFromCookies } from "../../lib/auth";

export const metadata = {
  title: "Dashboard | FinLending",
  description: "FinLending dashboard",
};

export default async function DashboardPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  return <FinLendingApp phoneNumber={session.phoneNumber} />;
}
