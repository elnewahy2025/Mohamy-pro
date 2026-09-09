'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ApiClient,
  ApiError,
  OrgConfigClient,
  type BranchResult,
  type DepartmentResult,
  type MemberRow,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { OperationResult } from '@/components/forms/operation-result';
import { EntityPicker } from '@/components/forms/entity-picker';

export function EmployeesDirectorySection(): React.ReactNode {
  const t = useTranslations();
  const { user } = useAuth();
  const [client] = useState(() => new ApiClient());
  const [orgClient] = useState(() => new OrgConfigClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [branches, setBranches] = useState<BranchResult[]>([]);
  const [departments, setDepartments] = useState<DepartmentResult[]>([]);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [membershipId, setMembershipId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [departmentId, setDepartmentId] = useState('');

  const branchName = (id: string | null): string =>
    branches.find((b) => b.id === id)?.name ?? '—';
  const departmentName = (id: string | null): string =>
    departments.find((d) => d.id === id)?.name ?? '—';
  const headcount = (branch: string): number =>
    members.filter((m) => m.branchId === branch).length;

  useEffect(() => {
    if (user) void runLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function runLoad(): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const [rows, branchRows, departmentRows] = await Promise.all([
        client.listMembers(),
        orgClient.listBranches(),
        orgClient.listDepartments(),
      ]);
      setMembers(rows);
      setBranches(branchRows);
      setDepartments(departmentRows);
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

  async function runPlace(): Promise<void> {
    if (!membershipId) return;
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      await client.placeMembership({
        membershipId,
        ...(branchId ? { branchId } : {}),
        ...(departmentId ? { departmentId } : {}),
      });
      await runLoad();
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
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="section-card">
        <p>{t('common.signInRequired')}</p>
      </div>
    );
  }

  return (
    <div className="section-card">
      <h3>{t('orgConfig.directory.heading')}</h3>
      <p>{t('orgConfig.directory.description')}</p>

      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runLoad()}
          disabled={submitting}
        >
          {submitting ? t('orgConfig.submitting') : t('orgConfig.load')}
        </Button>
      </div>

      {(status === 'success' || status === 'error') && (
        <OperationResult
          status={status}
          successLabel={t('orgConfig.result.title')}
          errorTitle={t('orgConfig.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          fields={[
            {
              label: t('orgConfig.directory.members'),
              value: String(members.length),
            },
          ]}
        />
      )}

      {members.length > 0 && (
        <ul className="mt-4 space-y-2">
          {members.map((member) => (
            <li key={member.id} className="text-sm">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setMembershipId(member.id);
                  setBranchId(member.branchId ?? '');
                  setDepartmentId(member.departmentId ?? '');
                }}
              >
                {member.user.displayName ??
                  member.user.emailNormalized ??
                  member.id.slice(0, 8)}{' '}
                — {branchName(member.branchId)} /{' '}
                {departmentName(member.departmentId)} [{member.status}]
              </Button>
            </li>
          ))}
        </ul>
      )}

      {branches.length > 0 && (
        <ul className="mt-4 space-y-2">
          {branches.map((branch) => (
            <li key={branch.id} className="text-sm">
              {branch.isHeadOffice ? '★ ' : ''}
              {branch.name}:{' '}
              {t('orgConfig.directory.headcount', {
                count: headcount(branch.id),
              })}
            </li>
          ))}
        </ul>
      )}

      <FormField
        label={t('orgConfig.directory.membershipIdLabel')}
        inputProps={{
          type: 'text',
          autoComplete: 'off',
          placeholder: t('orgConfig.directory.membershipIdPlaceholder'),
          value: membershipId,
          onChange: (event) => setMembershipId(event.target.value),
        }}
      />
      <EntityPicker
        label={t('orgConfig.directory.branchLabel')}
        placeholder={t('orgConfig.placeholders.branchId')}
        value={branchId}
        onChange={setBranchId}
        load={async () =>
          branches.map((b) => ({ id: b.id, label: b.name, sub: b.slug }))
        }
      />
      <EntityPicker
        label={t('orgConfig.directory.departmentLabel')}
        placeholder={t('orgConfig.placeholders.departmentId')}
        value={departmentId}
        onChange={setDepartmentId}
        load={async () =>
          departments.map((d) => ({ id: d.id, label: d.name, sub: d.slug }))
        }
      />
      <div className="form-actions form-actions-row mt-6">
        <Button
          type="button"
          variant="default"
          onClick={() => void runPlace()}
          disabled={submitting || !membershipId}
        >
          {submitting
            ? t('orgConfig.submitting')
            : t('orgConfig.directory.save')}
        </Button>
      </div>
    </div>
  );
}
