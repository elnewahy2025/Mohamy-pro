'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ImagePlus } from 'lucide-react';
import { ApiError, OrgConfigClient, type OrganizationResult } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface LogoUploadFieldProps {
  currentKey: string | null;
  onUploaded: (org: OrganizationResult) => void;
}

export function LogoUploadField({
  currentKey,
  onUploaded,
}: LogoUploadFieldProps) {
  const t = useTranslations();
  const [client] = useState(() => new OrgConfigClient());
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function onFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      onUploaded(await client.uploadLogo(file));
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : t('orgConfig.profile.logoFailed'),
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="form-field">
      <label className="form-field-label">
        {t('orgConfig.profile.logoLabel')}
      </label>
      {currentKey ? (
        <p className="form-field-hint">
          {t('orgConfig.profile.logoCurrent')}: {currentKey}
        </p>
      ) : null}
      <input
        ref={inputRef}
        className="form-input"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading}
        onChange={(event) => void onFile(event.target.files?.[0])}
        aria-label={t('orgConfig.profile.logoLabel')}
      />
      <div className="form-actions form-actions-row mt-2">
        <Button
          type="button"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" size={16} />
          {uploading
            ? t('orgConfig.submitting')
            : t('orgConfig.profile.logoUpload')}
        </Button>
      </div>
      {error ? <p className="form-field-hint">{error}</p> : null}
    </div>
  );
}
