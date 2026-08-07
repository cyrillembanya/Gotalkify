import Link from "next/link";

/** Full-width blue call-to-action banner. All strings passed in as props. */
export default function CTABanner({
  title,
  subtitle,
  buttonLabel,
  href = "/tutors",
  secondaryLabel,
  secondaryHref,
}) {
  return (
    <section className="container-page py-16">
      <div className="relative overflow-hidden rounded-2xl bg-brand-600 px-6 py-14 text-center sm:px-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-500 opacity-40"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-brand-700 opacity-40"
        />
        <div className="relative">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            {title}
          </h2>
          {subtitle ? (
            <p className="mx-auto mt-3 max-w-xl text-base text-brand-100">{subtitle}</p>
          ) : null}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={href}
              className="btn inline-flex bg-accent-400 text-brand-900 hover:bg-accent-300"
            >
              {buttonLabel}
            </Link>
            {secondaryLabel && secondaryHref ? (
              <Link
                href={secondaryHref}
                className="btn inline-flex border border-brand-300 text-white hover:bg-brand-700"
              >
                {secondaryLabel}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
