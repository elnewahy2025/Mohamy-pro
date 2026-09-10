'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

export interface EntityOption {
  id: string;
  label: string;
  sub?: string;
  data?: any;
}

interface EntityPickerProps {
  label: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (value: string, option?: EntityOption) => void;
  load: (search: string) => Promise<EntityOption[]>;
  minChars?: number;
  preload?: boolean;
  typeToSearchLabel?: string;
}

const globalPickerPromiseCache = new Map<string, Promise<EntityOption[]>>();

export function EntityPicker({
  label,
  placeholder,
  required,
  error,
  value,
  onChange,
  load,
  minChars = 0,
  preload = true,
  typeToSearchLabel,
}: EntityPickerProps): React.ReactNode {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<EntityOption[]>([]);
  const [initialOptions, setInitialOptions] = useState<EntityOption[] | null>(
    null,
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<EntityOption | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cacheKey = label + (placeholder ?? '');

  // Preload initial options on mount using global cache
  useEffect(() => {
    let cancelled = false;
    if (!preload) {
      setInitialOptions([]);
      return;
    }

    let promise = globalPickerPromiseCache.get(cacheKey);
    if (!promise) {
      promise = load('')
        .then((rows) => {
          return rows.slice(0, 20);
        })
        .catch((err) => {
          globalPickerPromiseCache.delete(cacheKey);
          throw err;
        });
      globalPickerPromiseCache.set(cacheKey, promise);
    }

    promise
      .then((top20) => {
        if (cancelled) return;
        setInitialOptions(top20);
        setOptions(top20);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Sync picked value
  useEffect(() => {
    if (!value) {
      setPicked(null);
      setQuery('');
      return;
    }
    if (picked?.id === value) return;

    // If we already have initialOptions loaded, try to resolve from there first
    if (initialOptions) {
      const match = initialOptions.find((row) => row.id === value);
      if (match) {
        setPicked(match);
        setQuery(match.label);
        return;
      }
    }

    let cancelled = false;
    void load('')
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((row) => row.id === value) ?? null;
        setPicked(match);
        setQuery(match ? match.label : '');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, initialOptions]);

  const queryCache = useRef<Record<string, EntityOption[]>>({});
  const [highlight, setHighlight] = useState(-1);
  const requestId = useRef(0);

  // Debounced search
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!open) return;

    // Instant load for empty query or if the query is just the currently picked item's label
    if (
      (query === '' || (picked && query === picked.label)) &&
      initialOptions !== null
    ) {
      setOptions(initialOptions);
      setLoading(false);
      setHighlight(-1);
      return;
    }

    if (query.trim().length < minChars) {
      setOptions([]);
      setLoading(false);
      setHighlight(-1);
      return;
    }

    // Instant load if this exact query was already searched
    if (queryCache.current[query]) {
      setOptions(queryCache.current[query]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const current = ++requestId.current;
    timer.current = setTimeout(() => {
      void load(query)
        .then((rows) => {
          if (requestId.current !== current) return;
          const top20 = rows.slice(0, 10);
          queryCache.current[query] = top20;
          setOptions(top20);
          setHighlight(top20.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (requestId.current === current) setOptions([]);
        })
        .finally(() => {
          if (requestId.current === current) setLoading(false);
        });
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, open, load, initialOptions, picked]);

  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        if (picked) {
          setQuery(picked.label);
        } else if (!value) {
          setQuery('');
        }
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, picked, value]);

  function pick(option: EntityOption): void {
    onChange(option.id, option);
    setPicked(option);
    setQuery(option.label);
    setOpen(false);
  }

  function clear(): void {
    onChange('', undefined);
    setPicked(null);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="form-field">
      <label className="form-field-label">
        {label}
        {required ? ' *' : ''}
      </label>
      <div style={{ position: 'relative' }} ref={wrapperRef}>
        <input
          className={`form-input${error ? ' has-error' : ''}`}
          style={{ width: '100%' }}
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
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && options.length > 0) {
              event.preventDefault();
              setOpen(true);
              setHighlight((h) => (h + 1) % options.length);
            } else if (event.key === 'ArrowUp' && options.length > 0) {
              event.preventDefault();
              setHighlight((h) => (h <= 0 ? options.length - 1 : h - 1));
            } else if (
              event.key === 'Enter' &&
              open &&
              highlight >= 0 &&
              options[highlight]
            ) {
              event.preventDefault();
              pick(options[highlight]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-invalid={error ? true : undefined}
        />
        {open ? (
          <ul className="entity-picker-dropdown" role="listbox">
            {loading ? (
              <li
                className="entity-picker-option"
                style={{
                  color: 'var(--muted)',
                  cursor: 'default',
                  pointerEvents: 'none',
                }}
              >
                {t('common.loading')}
              </li>
            ) : query.trim().length < minChars ? (
              <li
                className="entity-picker-option"
                style={{
                  color: 'var(--muted)',
                  cursor: 'default',
                  pointerEvents: 'none',
                }}
              >
                {typeToSearchLabel ?? t('common.typeToSearch')}
              </li>
            ) : options.length === 0 ? (
              <li
                className="entity-picker-option"
                style={{
                  color: 'var(--muted)',
                  cursor: 'default',
                  pointerEvents: 'none',
                }}
              >
                {t('common.noResults')}
              </li>
            ) : (
              options.map((option, index) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="entity-picker-option"
                    role="option"
                    aria-selected={option.id === value}
                    data-active={index === highlight || undefined}
                    style={
                      index === highlight
                        ? { background: '#f7f9fb' }
                        : undefined
                    }
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => pick(option)}
                  >
                    <HighlightMatch label={option.label} query={query} />
                    {option.sub ? (
                      <span className="entity-picker-option-sub">
                        {option.sub}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
            {!loading && value ? (
              <li
                style={{
                  borderTop: '1px solid var(--line)',
                  marginTop: '0.4rem',
                  paddingTop: '0.4rem',
                }}
              >
                <button
                  type="button"
                  className="entity-picker-option"
                  style={{ color: '#e35d6a' }}
                  onClick={clear}
                >
                  {t('common.clear')}
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p className="form-field-hint form-field-error">{error}</p>
      ) : null}
      {value && !open && picked ? (
        <p className="form-field-hint">{picked.label}</p>
      ) : null}
    </div>
  );
}

function HighlightMatch({ label, query }: { label: string; query: string }) {
  const needle = query.trim();
  if (!needle) return <>{label}</>;
  const index = label.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, index)}
      <mark>{label.slice(index, index + needle.length)}</mark>
      {label.slice(index + needle.length)}
    </>
  );
}
