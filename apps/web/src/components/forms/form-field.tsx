'use client';

import { useId, type InputHTMLAttributes } from 'react';

export interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  inputProps: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'id' | 'aria-invalid' | 'aria-describedby'
  >;
}

export function FormField({
  label,
  error,
  hint,
  inputProps,
}: FormFieldProps): React.ReactNode {
  const inputId = useId();
  const hintId = hint || error ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label className="form-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className={`form-input${error ? ' has-error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
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