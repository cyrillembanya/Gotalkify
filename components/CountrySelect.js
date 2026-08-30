"use client";

import { COUNTRIES } from "@/lib/countries";

/**
 * Country picker used for tutor nationality and current location. Stores the
 * country name (not a code) so it renders as-is in emails and admin screens.
 */
export default function CountrySelect({
  id,
  value,
  onChange,
  required,
  placeholder = "Select a country",
  className = "input",
}) {
  return (
    <select id={id} className={className} value={value} onChange={onChange} required={required}>
      <option value="">{placeholder}</option>
      {COUNTRIES.map((country) => (
        <option key={country} value={country}>
          {country}
        </option>
      ))}
    </select>
  );
}
