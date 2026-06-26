import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/app");
  return <AuthForm mode="login" />;
}
