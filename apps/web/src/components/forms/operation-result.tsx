'use client';

import { Check, AlertTriangle } from 'lucide-react';

export interface OperationResultProps {
  status: 'idle' | 'success' | 'error';
  successLabel: string;
  successBody?: string;
  errorTitle: string;
  onError?: string;
  errorCode?: string;
  errorDetails?: string[];
  requestId?: string;
  ariaLiveLabel?: string;
  fields?: Array<{ label: string; value: string }>;
}

export function OperationResult({
  status,
  successLabel,
  successBody,
  errorTitle,
  onError,
  errorCode,
  errorDetails,
  requestId,
  ariaLiveLabel,
  fields,
}: OperationResultProps): React.ReactNode {
  if (status === 'idle') return null;

  return (
    <div
      className={`operation-result is-${status}`}
      role="status"
      aria-live="polite"
      aria-label={ariaLiveLabel}
    >
      {status === 'success' ? (
        <>
          <span className="operation-result-icon" aria-hidden="true">
            <Check size={16} />
          </span>
          <div>
            <strong>{successLabel}</strong>
            {successBody ? <p>{successBody}</p> : null}
            {fields && fields.length > 0 ? (
              <dl className="operation-result-fields">
                {fields.map((field) => (
                  <div className="operation-result-field" key={field.label}>
                    <dt>{field.label}</dt>
                    <dd><code>{field.value}</code></dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <span className="operation-result-icon" aria-hidden="true">
            <AlertTriangle size={16} />
          </span>
          <div>
            <strong>{errorTitle}</strong>
            {onError ? <p>{onError}</p> : null}
            {errorCode ? (
              <p className="operation-result-code">
                <code>{errorCode}</code>
              </p>
            ) : null}
            {errorDetails && errorDetails.length > 0 ? (
              <ul className="operation-result-details">
                {errorDetails.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
            {requestId ? (
              <p className="operation-result-request-id">
                <code>{requestId}</code>
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}