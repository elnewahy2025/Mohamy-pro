'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, OrgConfigClient, type BranchResult } from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';
import type { OrganizationResult } from '@/lib/api';
import { FormSelect } from '@/components/forms/form-select';
import { CURRENCIES } from '@/lib/api';

const branchSchema = z.object({
  id: z.string().max(64).optional(),
  organizationId: z.string().min(1, 'invalidUuid'),
  slug: z.string().min(1, 'invalid').max(100, 'tooLong'),
  name: z.string().min(1, 'invalid').max(200, 'tooLong'),
  reason: z.string().max(200, 'tooLong').optional(),
  contactPhone: z.string().max(40, 'tooLong').optional(),
  contactEmail: z.string().max(320, 'tooLong').optional(),
  addressLine1: z.string().max(200, 'tooLong').optional(),
  city: z.string().max(120, 'tooLong').optional(),
  country: z.string().max(120, 'tooLong').optional(),
  postalCode: z.string().max(20, 'tooLong').optional(),
  mapUrl: z.string().max(500, 'tooLong').optional(),
  operatingCurrency: z.string().max(3).optional(),
  workingHours: z.string().max(200, 'tooLong').optional(),
  managerName: z.string().max(160, 'tooLong').optional(),
  isHeadOffice: z.boolean().optional(),
});
type BranchForm = z.infer<typeof branchSchema>;

type ActionKey = 'create' | 'update' | 'archive';

export function BranchSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<BranchResult | null>(null);
  const [items, setItems] = useState<BranchResult[]>([]);
  const [orgs, setOrgs] = useState<OrganizationResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      id: '',
      organizationId: '',
      slug: '',
      name: '',
      reason: '',
      contactPhone: '',
      contactEmail: '',
      addressLine1: '',
      city: '',
      country: '',
      postalCode: '',
      mapUrl: '',
      operatingCurrency: 'EGP',
      workingHours: '',
      managerName: '',
      isHeadOffice: false,
    },
  });

  async function run(action: ActionKey, form: BranchForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: BranchResult;
      const profile = {
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        addressLine1: form.addressLine1 || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        postalCode: form.postalCode || undefined,
        mapUrl: form.mapUrl || undefined,
        operatingCurrency: form.operatingCurrency || undefined,
        workingHours: form.workingHours || undefined,
        managerName: form.managerName || undefined,
        isHeadOffice: form.isHeadOffice,
      };
      if (action === 'create') {
        next = await client.createBranch({
          organizationId: form.organizationId,
          slug: form.slug,
          name: form.name,
          ...profile,
        });
      } else if (action === 'update') {
        next = await client.updateBranch({
          id: form.id as string,
          slug: form.slug || undefined,
          name: form.name || undefined,
          ...profile,
        });
      } else {
        next = await client.archiveBranch({
          id: form.id as string,
          reason: form.reason || undefined,
        });
      }
      setResult(next);
      setStatus('success');
      if (action === 'create') {
        setItems((prev) => [next, ...prev]);
        reset();
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

  const selectedOrgId = watch('organizationId');
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  useEffect(() => {
    if (!user) return;
    void client
      .listOrganizations()
      .then((rows) => {
        setOrgs(rows);
        if (rows.length === 1 && !selectedOrgId) {
          setValue('organizationId', rows[0].id, { shouldValidate: true });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user) void runList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      setItems(await client.listBranches());
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
          <MapPin size={18} />
        </span>
        <div>
          <h2>{t('orgConfig.sections.branch')}</h2>
          <p>{t('orgConfig.entity.branch.description')}</p>
        </div>
      </div>
      {selectedOrg ? (
        <p className="form-field-hint">
          {t('orgConfig.profile.inheritedFrom')}: {selectedOrg.name}
        </p>
      ) : null}
      <div className="form-grid">
        <FormField
          label={t('orgConfig.labels.entityId')}
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.placeholders.entityId'),
            ...register('id'),
          }}
        />
        <EntityPicker
          label={t('orgConfig.labels.organizationId')}
          placeholder={t('orgConfig.placeholders.organizationId')}
          required
          error={
            errors.organizationId
              ? t(`form.errors.${errors.organizationId.message}`)
              : undefined
          }
          value={watch('organizationId') ?? ''}
          onChange={(id) =>
            setValue('organizationId', id, { shouldValidate: true })
          }
          load={async () =>
            (await client.listOrganizations()).map((o) => ({
              id: o.id,
              label: o.name,
              sub: o.slug,
            }))
          }
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
          label={t('orgConfig.profile.workingHoursLabel')}
          error={
            errors.workingHours
              ? t(`form.errors.${errors.workingHours.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.workingHoursPlaceholder'),
            ...register('workingHours'),
          }}
        />
        <FormField
          label={t('orgConfig.profile.managerNameLabel')}
          error={
            errors.managerName
              ? t(`form.errors.${errors.managerName.message}`)
              : undefined
          }
          inputProps={{
            type: 'text',
            autoComplete: 'off',
            placeholder: t('orgConfig.profile.managerNamePlaceholder'),
            ...register('managerName'),
          }}
        />
        <FormSelect
          label={t('orgConfig.profile.operatingCurrencyLabel')}
          options={CURRENCIES.map((c) => ({ label: c, value: c }))}
          selectProps={{
            ...register('operatingCurrency'),
          }}
        />
        <label className="form-field">
          <span className="form-field-label">
            {t('orgConfig.profile.isHeadOfficeLabel')}
          </span>
          <input type="checkbox" {...register('isHeadOffice')} />
        </label>
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
                onClick={() => setValue('id', item.id)}
              >
                {item.isHeadOffice ? '★ ' : ''}
                {item.slug} — {item.name} [{item.status}]
              </Button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
