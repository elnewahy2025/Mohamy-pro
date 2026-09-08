'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface EntityOption {
  id: string;
  label: string;
  sub?: string;
}

interface EntityPickerProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (id: string) => void;
  load: (search: string) => Promise<EntityOption[]>;
}

export function EntityPicker({
  label,
  placeholder,
  required,
  error,
  value,
  onChange,
  load,
}: EntityPickerProps): React.ReactNode {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open) return;
    setLoading(true);
    timer.current = setTimeout(() => {
      void load(query)
        .then((rows) => setOptions(rows.slice(0, 20)))
        .catch(() => setOptions([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open, load]);

  function pick(option: EntityOption): void {
    onChange(option.id);
    setQuery(option.label);
    setOpen(false);
  }

  function clear(): void {
    onChange('');
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="form-field">
      <label className="form-field-label">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        className={`form-input${error ? ' has-error' : ''}`}
        type="text"
        autoComplete="off"
        placeholder={placeholder}
        value={query}
        required={required}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) onChange('');
        }}
        onFocus={() => setOpen(true)}
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="form-field-hint">{error}</p> : null}
      {open ? (
        <ul className="mt-2 space-y-1" role="listbox">
          {loading ? (
            <li className="text-sm">{t('common.loading')}</li>
          ) : (
            options.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  className="text-sm"
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => pick(option)}
                >
                  {option.label}
                  {option.sub ? ` — ${option.sub}` : ''}
                </button>
              </li>
            ))
          )}
          {!loading && value ? (
            <li>
              <button type="button" className="text-sm" onClick={clear}>
                {t('common.clear')}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {value && !open ? (
        <p className="form-field-hint">{query || value.slice(0, 8)}…</p>
      ) : null}
    </div>
  );
}
