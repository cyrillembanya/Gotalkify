"use client";

import { useState } from "react";

/** Accessible accordion. `items` = [{ q, a }]. First item open by default. */
export default function FaqAccordion({ items }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white shadow-card">
      {items.map((item, index) => {
        const open = openIndex === index;
        return (
          <div key={index}>
            <button
              type="button"
              onClick={() => setOpenIndex(open ? -1 : index)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
            >
              <span className="font-semibold text-slate-900">{item.q}</span>
              <svg
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 text-brand-600 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
            {open ? (
              <p className="px-6 pb-5 text-sm leading-6 text-slate-600">{item.a}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
