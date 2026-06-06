import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { BuilderWorkspace } from "@/components/BuilderWorkspace";

export default async function WorkspacePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return <BuilderWorkspace user={user} />;
}
