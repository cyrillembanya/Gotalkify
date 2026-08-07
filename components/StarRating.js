"use client";

/** Read-only stars, or interactive when `onChange` is provided. */
export default function StarRating({ value = 0, onChange, size = "h-5 w-5" }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= Math.round(value);
        const Star = (
          <svg
            className={`${size} ${filled ? "text-yellow-400" : "text-slate-300"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.958a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.367 2.446a1 1 0 00-.363 1.118l1.286 3.958c.3.922-.755 1.688-1.539 1.118l-3.367-2.446a1 1 0 00-1.175 0l-3.367 2.446c-.783.57-1.838-.196-1.538-1.118l1.285-3.958a1 1 0 00-.362-1.118L2.063 9.385c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.958z" />
          </svg>
        );
        return onChange ? (
          <button key={star} type="button" onClick={() => onChange(star)} aria-label={`${star} stars`}>
            {Star}
          </button>
        ) : (
          <span key={star}>{Star}</span>
        );
      })}
    </div>
  );
}
