import Link from "next/link";

/**
 * Shown by the sign-up forms when the email already belongs to a verified
 * account. Rather than a dead end, point at the two ways back in.
 */
export default function AccountExists({ email, next }) {
  const query = new URLSearchParams();
  if (email) query.set("email", email);
  if (next) query.set("next", next);
  const suffix = query.size > 0 ? `?${query}` : "";
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">An account with this email already exists.</p>
      <p className="mt-1">
        <Link href={`/login${suffix}`} className="font-semibold text-brand-600 hover:underline">
          Log in
        </Link>{" "}
        to continue, or{" "}
        <Link
          href={`/forgot-password${suffix}`}
          className="font-semibold text-brand-600 hover:underline"
        >
          reset your password
        </Link>{" "}
        if you&apos;ve forgotten it.
      </p>
    </div>
  );
}
