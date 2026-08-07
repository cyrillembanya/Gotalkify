/** Centered (or left-aligned) section heading with optional subtitle. */
export default function SectionHeading({ title, subtitle, align = "center" }) {
  const alignClass = align === "left" ? "text-left" : "mx-auto max-w-2xl text-center";
  return (
    <div className={alignClass}>
      <h2 className="section-title">{title}</h2>
      {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
    </div>
  );
}
