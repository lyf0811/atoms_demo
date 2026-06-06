import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AuthForm } from "@/components/AuthForm";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/workspace");
  }

  return <AuthForm mode="register" />;
}
