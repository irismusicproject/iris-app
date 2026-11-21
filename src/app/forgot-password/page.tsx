import Link from "next/link";
import { AuthCard, linkClass } from "@/components/auth-card";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Forgot password · Iris Music Project" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot password"
      intro="Enter your email and we'll send you a link to set a new password."
      footer={
        <Link href="/login" className={linkClass}>
          Back to log in
        </Link>
      }
    >
      <ResetForm />
    </AuthCard>
  );
}
