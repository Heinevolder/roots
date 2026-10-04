import { LoginForm } from "./form";

export const metadata = { title: "Log ind · Roots" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="font-display text-5xl font-semibold tracking-tight">Roots</h1>
      <p className="mt-2 mb-8 text-muted">Madplan og indkøbsliste</p>
      <LoginForm />
    </main>
  );
}
