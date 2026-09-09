'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, OrgConfigClient, type OrganizationResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { FormSelect } from '@/components/forms/form-select';
import { LogoUploadField } from '@/components/pages/org-config/logo-upload-field';
import { CURRENCIES } from '@/lib/api';

const organizationSchema = z.object({
  id: z.string().max(64).optional(),
  slug: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(200, 'tooLong'),
  reason: z.string().max(200, 'tooLong').optional(),
  website: z.string().max(500, 'tooLong').optional(),
  contactEmail: z.string().max(320, 'tooLong').optional(),
  contactPhone: z.string().max(40, 'tooLong').optional(),
  addressLine1: z.string().max(200, 'tooLong').optional(),
  city: z.string().max(120, 'tooLong').optional(),
  country: z.string().max(120, 'tooLong').optional(),
  postalCode: z.string().max(20, 'tooLong').optional(),
  mapUrl: z.string().max(500, 'tooLong').optional(),
  registrationNumber: z.string().max(80, 'tooLong').optional(),
  taxNumber: z.string().max(80, 'tooLong').optional(),
  baseCurrency: z.string().max(3).optional(),
  socialX: z.string().max(500, 'tooLong').optional(),
  socialLinkedIn: z.string().max(500, 'tooLong').optional(),
  socialFacebook: z.string().max(500, 'tooLong').optional(),
  socialInstagram: z.string().max(500, 'tooLong').optional(),
});
type OrganizationForm = z.infer<typeof organizationSchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function OrganizationSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<OrganizationResult | null>(null);
  const [items, setItems] = useState<OrganizationResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<OrganizationForm>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      id: '',
      slug: '',
      name: '',
      reason: '',
      website: '',
      contactEmail: '',
      contactPhone: '',
      addressLine1: '',
      city: '',
      country: '',
      postalCode: '',
      mapUrl: '',
      registrationNumber: '',
      taxNumber: '',
      baseCurrency: 'EGP',
      socialX: '',
      socialLinkedIn: '',
      socialFacebook: '',
      socialInstagram: '',
    },
  });

  async function run(action: ActionKey, form: OrganizationForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: OrganizationResult;
      const socialLinks: Record<string, string> = {};
      if (form.socialX) socialLinks.x = form.socialX;
      if (form.socialLinkedIn) socialLinks.linkedin = form.socialLinkedIn;
      if (form.socialFacebook) socialLinks.facebook = form.socialFacebook;
      if (form.socialInstagram) socialLinks.instagram = form.socialInstagram;
      const profile = {
        website: form.website || undefined,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        addressLine1: form.addressLine1 || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        postalCode: form.postalCode || undefined,
        mapUrl: form.mapUrl || undefined,
        registrationNumber: form.registrationNumber || undefined,
        taxNumber: form.taxNumber || undefined,
        baseCurrency: form.baseCurrency || undefined,
        socialLinks:
          Object.keys(socialLinks).length > 0 ? socialLinks : undefined,
      };
      if (action === 'create') {
        next = await client.createOrganization({
          slug: form.slug,
          name: form.name,
          ...profile,
        });
      } else if (action === 'update') {
        next = await client.updateOrganization({
          id: form.id as string,
          slug: form.slug || undefined,
          name: form.name || undefined,
          ...profile,
        });
      } else {
        next = await client.archiveOrganization({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        setItems((prev) => [next, ...prev]);
        reset({ id: '', slug: '', name: '', reason: '' });
      }
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(
              error instanceof Error ? error.message : 'Unknown error',
              'INTERNAL',
              [],
              0,
            ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function trigger(action: ActionKey): Promise<void> {
    await handleSubmit((form) => run(action, form))();
  }

  function fillForm(item: OrganizationResult): void {
    setValue('id', item.id);
    setValue('slug', item.slug);
    setValue('name', item.name);
    setValue('website', item.website ?? '');
    setValue('contactEmail', item.contactEmail ?? '');
    setValue('contactPhone', item.contactPhone ?? '');
    setValue('addressLine1', item.addressLine1 ?? '');
    setValue('city', item.city ?? '');
    setValue('country', item.country ?? '');
    setValue('postalCode', item.postalCode ?? '');
    setValue('mapUrl', item.mapUrl ?? '');
    setValue('registrationNumber', item.registrationNumber ?? '');
    setValue('taxNumber', item.taxNumber ?? '');
    setValue('baseCurrency', item.baseCurrency ?? 'EGP');
    setValue('socialX', item.socialLinks?.x ?? '');
    setValue('socialLinkedIn', item.socialLinks?.linkedin ?? '');
    setValue('socialFacebook', item.socialLinks?.facebook ?? '');
    setValue('socialInstagram', item.socialLinks?.instagram ?? '');
  }

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const rows = await client.listOrganizations();
      setItems(rows);
      if (rows.length === 1) fillForm(rows[0]);
      setStatus('success');
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(
              error instanceof Error ? error.message : 'Unknown error',
              'INTERNAL',
              [],
              0,
            ),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          <Building2 size={18} />
        </span>
        <div>
          <h2>{t('orgConfig.sections.organization')}</h2>
          <p>{t('orgConfig.entity.organization.description')}</p>
        </div>
      </div>
      <div className="form-grid">
        <FormField
          label={t('orgConfig.labels.entityId')}
          error={errors.id ? undefined : undefined}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.entityId'),
            ...register('id'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.slug')}
          error={
            errors.slug ? t(`form.errors.${errors.slug.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.slug'),
            ...register('slug'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.name')}
          error={
            errors.name ? t(`form.errors.${errors.name.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.name'),
            ...register('name'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.websiteLabel')}
          error={
            errors.website
              ? t(`form.errors.${errors.website.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.websitePlaceholder'),
            ...register('website'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.contactEmailLabel')}
          error={
            errors.contactEmail
              ? t(`form.errors.${errors.contactEmail.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.contactEmailPlaceholder'),
            ...register('contactEmail'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.contactPhoneLabel')}
          error={
            errors.contactPhone
              ? t(`form.errors.${errors.contactPhone.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.contactPhonePlaceholder'),
            ...register('contactPhone'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.addressLine1Label')}
          error={
            errors.addressLine1
              ? t(`form.errors.${errors.addressLine1.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.addressLine1Placeholder'),
            ...register('addressLine1'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.cityLabel')}
          error={
            errors.city ? t(`form.errors.${errors.city.message}`) : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.cityPlaceholder'),
            ...register('city'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.countryLabel')}
          error={
            errors.country
              ? t(`form.errors.${errors.country.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.countryPlaceholder'),
            ...register('country'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.postalCodeLabel')}
          error={
            errors.postalCode
              ? t(`form.errors.${errors.postalCode.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.postalCodePlaceholder'),
            ...register('postalCode'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.mapUrlLabel')}
          error={
            errors.mapUrl
              ? t(`form.errors.${errors.mapUrl.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.mapUrlPlaceholder'),
            ...register('mapUrl'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.registrationNumberLabel')}
          error={
            errors.registrationNumber
              ? t(`form.errors.${errors.registrationNumber.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.registrationNumberPlaceholder'),
            ...register('registrationNumber'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.taxNumberLabel')}
          error={
            errors.taxNumber
              ? t(`form.errors.${errors.taxNumber.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.taxNumberPlaceholder'),
            ...register('taxNumber'),
          }}
        />
        <FormSelect
          label={t('orgConfig.profile.baseCurrencyLabel')}
          options={CURRENCIES.map((c) => ({ label: c, value: c }))}
          selectProps={{
            ...register('baseCurrency'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.socialXLabel')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: 'https://…',
            ...register('socialX'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.socialLinkedInLabel')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: 'https://…',
            ...register('socialLinkedIn'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.socialFacebookLabel')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: 'https://…',
            ...register('socialFacebook'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.socialInstagramLabel')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: 'https://…',
            ...register('socialInstagram'),
          }}
        />
        <FormField
          label={t('orgConfig.labels.reason')}
          error={
            errors.reason
              ? t(`form.errors.${errors.reason.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.reason'),
            ...register('reason'),
          }}
        />
        <LogoUploadField
          currentKey={result?.logoObjectKey ?? items[0]?.logoObjectKey ?? null}
          onUploaded={(next) => {
            setResult(next);
            setItems((prev) => prev.map((o) => (o.id === next.id ? next : o)));
          }}
        />
      </div>
      <div className="form-actions form-actions-row">
        <Button
          type="button"
          variant="default"
          onClick={() => void trigger('create')}
          disabled={submitting || authLoading || !user}
        >
          {submitting ? t('orgConfig.submitting') : t('orgConfig.create')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void trigger('update')}
          disabled={submitting}
        >
          {submitting ? t('orgConfig.submitting') : t('orgConfig.update')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void trigger('archive')}
          disabled={submitting}
        >
          {submitting ? t('orgConfig.submitting') : t('orgConfig.archive')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void runList()}
          disabled={submitting}
        >
          {submitting ? t('orgConfig.submitting') : t('orgConfig.load')}
        </Button>
      </div>
      <OperationResult
        status={status}
        successLabel={t('orgConfig.result.title')}
        errorTitle={t('orgConfig.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
        fields={
          result
            ? [
                { label: t('orgConfig.result.id'), value: result.id },
                { label: t('orgConfig.result.status'), value: result.status },
              ]
            : undefined
        }
      />
      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => fillForm(item)}
              >
                {item.slug} — {item.name} [{item.status}]
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
