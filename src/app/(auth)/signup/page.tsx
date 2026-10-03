import { SignupForm } from "@/components/AuthForms";

export default function SignupPage() {
  return (
    <div className="mx-auto grid max-w-md gap-6 py-6">
      <div>
        <h1 className="text-4xl font-medium">Join MyTailor</h1>
        <p className="mt-2 text-muted">Customers post what they need. Tailors bid blind. One bid wins.</p>
      </div>
      <SignupForm />
    </div>
  );
}
