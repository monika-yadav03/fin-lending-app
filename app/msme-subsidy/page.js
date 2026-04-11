import { redirect } from "next/navigation";

import MsmeSubsidyForm from "../../components/msme-subsidy-form";
import { getSessionFromCookies } from "../../lib/auth";

export const metadata = {
  title: "MSME Subsidy Finder | FinLending",
  description: "Check eligible MSME subsidy schemes for your business",
};

export default async function MsmeSubsidyPage() {
  const session = await getSessionFromCookies();

  if (!session) {
    redirect("/login");
  }

  return <MsmeSubsidyForm />;
}
