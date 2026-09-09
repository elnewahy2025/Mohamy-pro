'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, ShieldCheck } from 'lucide-react';
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

type SubTab = 'general' | 'contact' | 'business' | 'socials' | 'danger';

const SUB_TABS: SubTab[] = [
  'general',
  'contact',
  'business',
  'socials',
  'danger',
];

const EMPTY_DEFAULTS: OrganizationForm = {
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
};

export function OrganizationSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<OrganizationResult | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>('general');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<OrganizationForm>({
    resolver: zodResolver(organizationSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  function fillForm(item: OrganizationResult): void {
    setResult(item);
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

  async function runLoad(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const [rows, ctx] = await Promise.all([
        client.listOrganizations(),
        client.context().catch(() => null),
      ]);
      if (rows.length === 1) fillForm(rows[0]);
      if (ctx?.organization?.logoUrl) setLogoUrl(ctx.organization.logoUrl);
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

  useEffect(() => {
    if (user) void runLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function profilePayload(form: OrganizationForm) {
    const socialLinks: Record<string, string> = {};
    if (form.socialX) socialLinks.x = form.socialX;
    if (form.socialLinkedIn) socialLinks.linkedin = form.socialLinkedIn;
    if (form.socialFacebook) socialLinks.facebook = form.socialFacebook;
    if (form.socialInstagram) socialLinks.instagram = form.socialInstagram;
    return {
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
  }

  async function fail(error: unknown): Promise<void> {
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
    setSubmitting(false);
  }

  async function runSave(): Promise<void> {
    const form = getValues();
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: OrganizationResult;
      if (form.id) {
        next = await client.updateOrganization({
          id: form.id,
          slug: form.slug || undefined,
          name: form.name || undefined,
          ...profilePayload(form),
        });
      } else {
        next = await client.createOrganization({
          slug: form.slug,
          name: form.name,
          ...profilePayload(form),
        });
      }
      fillForm(next);
      setStatus('success');
    } catch (error) {
      await fail(error);
      return;
    } finally {
      setSubmitting(false);
    }
  }

  async function runArchive(): Promise<void> {
    const id = getValues('id');
    if (!id) return;
    if (!window.confirm(t('orgConfig.result.archiveConfirm'))) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      await client.archiveOrganization({
        id,
        reason: getValues('reason') || undefined,
      });
      reset(EMPTY_DEFAULTS);
      setResult(null);
      setStatus('success');
    } catch (error) {
      await fail(error);
      return;
    } finally {
      setSubmitting(false);
    }
  }

  const exists = result !== null;

  function textField(
    name:
      | 'slug'
      | 'name'
      | 'website'
      | 'contactEmail'
      | 'contactPhone'
      | 'addressLine1'
      | 'city'
      | 'country'
      | 'postalCode'
      | 'mapUrl'
      | 'registrationNumber'
      | 'taxNumber'
      | 'socialX'
      | 'socialLinkedIn'
      | 'socialFacebook'
      | 'socialInstagram'
      | 'reason',
    labelKey: string,
    placeholderKey: string,
    required = false,
  ): React.ReactNode {
    const message = errors[name]?.message;
    return (
      <FormField
        label={t(labelKey)}
        error={message ? t(`form.errors.${message}`) : undefined}
        inputProps={{
          type: 'text',
          autoComplete: 'off',
          placeholder: t(placeholderKey),
          required,
          ...register(name),
        }}
      />
    );
  }

  return (
    <form className="settings-card" noValidate>
      <div className="settings-card-heading">
        <span className="settings-icon" aria-hidden="true">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={22}
              height={22}
              style={{ borderRadius: '6px', objectFit: 'cover' }}
            />
          ) : (
            <Building2 size={18} />
          )}
        </span>
        <div>
          <h2>{t('orgConfig.sections.organization')}</h2>
          <p>{t('orgConfig.entity.organization.description')}</p>
        </div>
      </div>

      {result ? (
        <p className="form-field-hint">
          {result.slug} — {result.name} [{result.status}]
        </p>
      ) : null}

      <div className="flex gap-2 mb-6 border-b border-gray-200 pb-2 flex-wrap">
        {SUB_TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant={subTab === tab ? 'default' : 'ghost'}
            onClick={() => setSubTab(tab)}
          >
            {t(`orgConfig.orgTabs.${tab}`)}
          </Button>
        ))}
      </div>

      {subTab === 'general' && (
        <div className="form-grid">
          {textField(
            'slug',
            'orgConfig.labels.slug',
            'orgConfig.placeholders.slug',
            true,
          )}
          {textField(
            'name',
            'orgConfig.labels.name',
            'orgConfig.placeholders.name',
            true,
          )}
          <LogoUploadField
            currentKey={result?.logoObjectKey ?? null}
            onUploaded={(next) => {
              fillForm(next);
              void client
                .context()
                .then((ctx) => {
                  if (ctx?.organization?.logoUrl)
                    setLogoUrl(ctx.organization.logoUrl);
                })
                .catch(() => {});
            }}
          />
        </div>
      )}

      {subTab === 'contact' && (
        <div className="form-grid">
          {textField(
            'contactEmail',
            'orgConfig.profile.contactEmailLabel',
            'orgConfig.profile.contactEmailPlaceholder',
          )}
          {textField(
            'contactPhone',
            'orgConfig.profile.contactPhoneLabel',
            'orgConfig.profile.contactPhonePlaceholder',
          )}
          {textField(
            'addressLine1',
            'orgConfig.profile.addressLine1Label',
            'orgConfig.profile.addressLine1Placeholder',
          )}
          {textField(
            'city',
            'orgConfig.profile.cityLabel',
            'orgConfig.profile.cityPlaceholder',
          )}
          {textField(
            'country',
            'orgConfig.profile.countryLabel',
            'orgConfig.profile.countryPlaceholder',
          )}
          {textField(
            'postalCode',
            'orgConfig.profile.postalCodeLabel',
            'orgConfig.profile.postalCodePlaceholder',
          )}
          {textField(
            'mapUrl',
            'orgConfig.profile.mapUrlLabel',
            'orgConfig.profile.mapUrlPlaceholder',
          )}
        </div>
      )}

      {subTab === 'business' && (
        <div className="form-grid">
          {textField(
            'registrationNumber',
            'orgConfig.profile.registrationNumberLabel',
            'orgConfig.profile.registrationNumberPlaceholder',
          )}
          {textField(
            'taxNumber',
            'orgConfig.profile.taxNumberLabel',
            'orgConfig.profile.taxNumberPlaceholder',
          )}
          <FormSelect
            label={t('orgConfig.profile.baseCurrencyLabel')}
            options={CURRENCIES.map((c) => ({ label: c, value: c }))}
            selectProps={{
              ...register('baseCurrency'),
            }}
          />
        </div>
      )}

      {subTab === 'socials' && (
        <div className="form-grid">
          {textField(
            'socialX',
            'orgConfig.profile.socialXLabel',
            'orgConfig.profile.urlPlaceholder',
          )}
          {textField(
            'socialLinkedIn',
            'orgConfig.profile.socialLinkedInLabel',
            'orgConfig.profile.urlPlaceholder',
          )}
          {textField(
            'socialFacebook',
            'orgConfig.profile.socialFacebookLabel',
            'orgConfig.profile.urlPlaceholder',
          )}
          {textField(
            'socialInstagram',
            'orgConfig.profile.socialInstagramLabel',
            'orgConfig.profile.urlPlaceholder',
          )}
        </div>
      )}

      {subTab === 'danger' && (
        <div className="form-grid">
          <p className="security-note" role="note">
            <ShieldCheck aria-hidden="true" size={16} />
            {t('orgConfig.dangerWarning')}
          </p>
          {textField(
            'reason',
            'orgConfig.labels.reason',
            'orgConfig.placeholders.reason',
          )}
          <div className="form-actions form-actions-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => void runArchive()}
              disabled={submitting || !exists}
            >
              {submitting ? t('orgConfig.submitting') : t('orgConfig.archive')}
            </Button>
          </div>
        </div>
      )}

      {subTab !== 'danger' && (
        <div className="form-actions form-actions-row mt-6">
          <Button
            type="button"
            variant="default"
            onClick={() => void handleSubmit(() => runSave())()}
            disabled={submitting || authLoading || !user}
          >
            {submitting
              ? t('orgConfig.submitting')
              : exists
                ? t('orgConfig.save')
                : t('orgConfig.create')}
          </Button>
        </div>
      )}

      <OperationResult
        status={status}
        successLabel={t('orgConfig.result.title')}
        errorTitle={t('orgConfig.result.errorTitle')}
        onError={submitError?.message}
        errorCode={submitError?.code}
        errorDetails={submitError?.details}
        requestId={submitError?.requestId}
        ariaLiveLabel={t('identity.result.successAriaLive')}
      />
    </form>
  );
}
