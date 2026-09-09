'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { MapPin, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  OrgConfigClient,
  CURRENCIES,
  type BranchResult,
  type OrganizationResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

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

type SubTab = 'general' | 'contact' | 'business' | 'danger';

const SUB_TABS: SubTab[] = ['general', 'contact', 'business', 'danger'];

const EMPTY_DEFAULTS: BranchForm = {
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
};

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
  const [subTab, setSubTab] = useState<SubTab>('general');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { errors },
  } = useForm<BranchForm>({
    resolver: zodResolver(branchSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  function fillForm(item: BranchResult): void {
    setResult(item);
    setValue('id', item.id);
    setValue('organizationId', item.organizationId);
    setValue('slug', item.slug);
    setValue('name', item.name);
    setValue('contactPhone', item.contactPhone ?? '');
    setValue('contactEmail', item.contactEmail ?? '');
    setValue('addressLine1', item.addressLine1 ?? '');
    setValue('city', item.city ?? '');
    setValue('country', item.country ?? '');
    setValue('postalCode', item.postalCode ?? '');
    setValue('mapUrl', item.mapUrl ?? '');
    setValue('operatingCurrency', item.operatingCurrency ?? 'EGP');
    setValue('workingHours', item.workingHours ?? '');
    setValue('managerName', item.managerName ?? '');
    setValue('isHeadOffice', item.isHeadOffice ?? false);
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

  async function runList(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const [rows, orgRows] = await Promise.all([
        client.listBranches(),
        client.listOrganizations().catch(() => []),
      ]);
      setItems(rows);
      setOrgs(orgRows);
      if (rows.length === 1) fillForm(rows[0]);
      setStatus('success');
    } catch (error) {
      await fail(error);
      return;
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (user) void runList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function profilePayload(form: BranchForm) {
    return {
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
  }

  async function runSave(): Promise<void> {
    const form = getValues();
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      let next: BranchResult;
      if (form.id) {
        next = await client.updateBranch({
          id: form.id,
          slug: form.slug || undefined,
          name: form.name || undefined,
          ...profilePayload(form),
        });
      } else {
        next = await client.createBranch({
          organizationId: form.organizationId,
          slug: form.slug,
          name: form.name,
          ...profilePayload(form),
        });
      }
      fillForm(next);
      setItems((prev) =>
        prev.some((b) => b.id === next.id)
          ? prev.map((b) => (b.id === next.id ? next : b))
          : [next, ...prev],
      );
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
      await client.archiveBranch({
        id,
        reason: getValues('reason') || undefined,
      });
      reset(EMPTY_DEFAULTS);
      setResult(null);
      await runList();
    } catch (error) {
      await fail(error);
      return;
    } finally {
      setSubmitting(false);
    }
  }

  const exists = result !== null;
  const selectedOrgId = watch('organizationId');
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) ?? null;

  function textField(
    name:
      | 'slug'
      | 'name'
      | 'contactPhone'
      | 'contactEmail'
      | 'addressLine1'
      | 'city'
      | 'country'
      | 'postalCode'
      | 'mapUrl'
      | 'workingHours'
      | 'managerName'
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
          <MapPin size={18} />
        </span>
        <div>
          <h2>{t('orgConfig.sections.branch')}</h2>
          <p>{t('orgConfig.entity.branch.description')}</p>
        </div>
      </div>

      {result ? (
        <p className="form-field-hint">
          {result.isHeadOffice ? '★ ' : ''}
          {result.slug} — {result.name} [{result.status}]
        </p>
      ) : null}
      {selectedOrg ? (
        <p className="form-field-hint">
          {t('orgConfig.profile.inheritedFrom')}: {selectedOrg.name}
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
        </div>
      )}

      {subTab === 'contact' && (
        <div className="form-grid">
          {textField(
            'contactPhone',
            'orgConfig.profile.contactPhoneLabel',
            'orgConfig.profile.contactPhonePlaceholder',
          )}
          {textField(
            'contactEmail',
            'orgConfig.profile.contactEmailLabel',
            'orgConfig.profile.contactEmailPlaceholder',
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
          <FormSelect
            label={t('orgConfig.profile.operatingCurrencyLabel')}
            options={CURRENCIES.map((c) => ({ label: c, value: c }))}
            selectProps={{
              ...register('operatingCurrency'),
            }}
          />
          {textField(
            'workingHours',
            'orgConfig.profile.workingHoursLabel',
            'orgConfig.profile.workingHoursPlaceholder',
          )}
          {textField(
            'managerName',
            'orgConfig.profile.managerNameLabel',
            'orgConfig.profile.managerNamePlaceholder',
          )}
          <label className="form-field">
            <span className="form-field-label">
              {t('orgConfig.profile.isHeadOfficeLabel')}
            </span>
            <input type="checkbox" {...register('isHeadOffice')} />
          </label>
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

      {items.length > 1 && (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => fillForm(item)}
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
