import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  return <AuthForm mode="signup" />;
}
