'use client';

import { useId, type SelectHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';

export interface FormSelectProps {
  label: string;
  error?: string;
  hint?: string;
  selectProps: Omit<
    SelectHTMLAttributes<HTMLSelectElement>,
    'id' | 'aria-invalid' | 'aria-describedby'
  >;
  options: { label: string; value: string }[];
}

export function FormSelect({
  label,
  error,
  hint,
  selectProps,
  options,
}: FormSelectProps): React.ReactNode {
  const t = useTranslations();
  const inputId = useId();
  const hintId = hint || error ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label className="form-field-label" htmlFor={inputId}>
        {label}
      </label>
      <select
        id={inputId}
        className={`form-input${error ? ' has-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...selectProps}
      >
        <option value="" disabled>
          {t('form.select.placeholder', { label: label.toLowerCase() })}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !error ? (
        <p className="form-field-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="form-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
