import { LoginForm } from "@/components/AuthForms";

export default function LoginPage() {
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div>
        <h1 className="text-4xl font-medium">Welcome back</h1>
        <p className="mt-2 text-muted">Log in to see your requests, bids and orders.</p>
      </div>
      <LoginForm />
    </div>
  );
}
