'use client';

import { useState, useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { GitCommit, UploadCloud, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm, useFieldArray } from 'react-hook-form';
import { z } from 'zod';
import {
  ApiError,
  WorkflowsClient,
  type WorkflowResult,
  type WorkflowVersionResult,
} from '@/lib/api';
import { useAuth } from '@/auth/auth-provider';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/forms/form-field';
import { FormSelect } from '@/components/forms/form-select';
import { OperationResult } from '@/components/forms/operation-result';

const stateSchema = z.object({
  name: z.string().min(1, 'invalid'),
  isInitial: z.boolean(),
  isFinal: z.boolean(),
});

const transitionSchema = z.object({
  fromStateName: z.string().optional(),
  toStateName: z.string().min(1, 'invalid'),
  conditionsJson: z.string().optional(),
  actionsJson: z.string().optional(),
  requiresApproval: z.boolean(),
});

const createVersionSchema = z.object({
  workflowId: z.string().min(1, 'invalid'),
  states: z.array(stateSchema).min(1, 'invalid'),
  transitions: z.array(transitionSchema),
});
type CreateVersionForm = z.infer<typeof createVersionSchema>;

const publishVersionSchema = z.object({
  versionId: z.string().min(1, 'invalid'),
});
type PublishVersionForm = z.infer<typeof publishVersionSchema>;

export function WorkflowVersionSection(): React.ReactNode {
  const t = useTranslations();
  const { isLoading: authLoading, user } = useAuth();
  const [client] = useState(() => new WorkflowsClient());
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<WorkflowVersionResult | null>(null);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [workflows, setWorkflows] = useState<WorkflowResult[]>([]);
  
  useEffect(() => {
    if (user) {
      client.listWorkflows().then(setWorkflows).catch(() => {});
    }
  }, [user, client]);

  const createForm = useForm<CreateVersionForm>({
    resolver: zodResolver(createVersionSchema),
    defaultValues: { 
      workflowId: '', 
      states: [{ name: '', isInitial: true, isFinal: false }], 
      transitions: [] 
    },
  });

  const publishForm = useForm<PublishVersionForm>({
    resolver: zodResolver(publishVersionSchema),
    defaultValues: { versionId: '' },
  });

  const statesArray = useFieldArray({
    control: createForm.control,
    name: 'states',
  });

  const transitionsArray = useFieldArray({
    control: createForm.control,
    name: 'transitions',
  });

  async function runCreate(form: CreateVersionForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const transitions = form.transitions.map(t => {
        let conditions, actions;
        try { if (t.conditionsJson) conditions = JSON.parse(t.conditionsJson); } catch(e) {}
        try { if (t.actionsJson) actions = JSON.parse(t.actionsJson); } catch(e) {}
        
        return {
          fromStateName: t.fromStateName || undefined,
          toStateName: t.toStateName,
          conditions,
          actions,
          requiresApproval: t.requiresApproval,
        };
      });

      const res = await client.createVersion(form.workflowId, {
        states: form.states,
        transitions,
      });
      setResult(res);
      setStatus('success');
      createForm.reset({
        workflowId: '',
        states: [{ name: '', isInitial: true, isFinal: false }],
        transitions: []
      });
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function runPublish(form: PublishVersionForm): Promise<void> {
    setSubmitting(true);
    setStatus('idle');
    setSubmitError(null);
    try {
      const res = await client.publishVersion(form.versionId);
      setResult(res);
      setStatus('success');
      publishForm.reset();
    } catch (error) {
      setStatus('error');
      setSubmitError(
        error instanceof ApiError
          ? error
          : new ApiError(error instanceof Error ? error.message : 'Unknown error', 'INTERNAL', [], 0),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="settings-card" noValidate>
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true"><GitCommit size={18} /></span>
          <div>
            <h2>{t('workflows.sections.version')}</h2>
            <p>{t('workflows.description')}</p>
          </div>
        </div>
        
        <div className="form-grid">
          <FormSelect
            label={t('workflows.labels.id')}
            error={createForm.formState.errors.workflowId ? t(`form.errors.${createForm.formState.errors.workflowId.message}`) : undefined}
            options={workflows.map(w => ({ label: w.name, value: w.id }))}
            selectProps={{
              ...createForm.register('workflowId'),
            }}
          />
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>States</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => statesArray.append({ name: '', isInitial: false, isFinal: false })}>
              <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add State
            </Button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {statesArray.fields.map((field, index) => (
              <div key={field.id} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '1rem', backgroundColor: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                <div style={{ flex: 1 }}>
                  <FormField
                    label="State Name"
                    error={createForm.formState.errors.states?.[index]?.name ? 'Required' : undefined}
                    inputProps={{
                      type: 'text',
                      placeholder: 'e.g. IN_REVIEW',
                      ...createForm.register(`states.${index}.name`),
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', paddingTop: '2rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" {...createForm.register(`states.${index}.isInitial`)} />
                    <span style={{ fontSize: '0.9rem' }}>Initial</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" {...createForm.register(`states.${index}.isFinal`)} />
                    <span style={{ fontSize: '0.9rem' }}>Final</span>
                  </label>
                  <Button type="button" variant="ghost" size="icon" onClick={() => statesArray.remove(index)}>
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--gray-200)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Transitions</h3>
            <Button type="button" variant="outline" size="sm" onClick={() => transitionsArray.append({ fromStateName: '', toStateName: '', conditionsJson: '', actionsJson: '', requiresApproval: false })}>
              <Plus size={16} style={{ marginRight: '0.5rem' }} /> Add Transition
            </Button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {transitionsArray.fields.map((field, index) => (
              <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem', backgroundColor: 'var(--gray-50)', borderRadius: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <FormField
                      label="From State (Optional)"
                      inputProps={{
                        type: 'text',
                        placeholder: 'e.g. DRAFT',
                        ...createForm.register(`transitions.${index}.fromStateName`),
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <FormField
                      label="To State"
                      error={createForm.formState.errors.transitions?.[index]?.toStateName ? 'Required' : undefined}
                      inputProps={{
                        type: 'text',
                        placeholder: 'e.g. IN_REVIEW',
                        ...createForm.register(`transitions.${index}.toStateName`),
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', paddingTop: '2rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                      <input type="checkbox" {...createForm.register(`transitions.${index}.requiresApproval`)} />
                      <span style={{ fontSize: '0.9rem' }}>Requires Approval</span>
                    </label>
                    <Button type="button" variant="ghost" size="icon" onClick={() => transitionsArray.remove(index)}>
                      <Trash2 size={16} />
                    </Button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <FormField
                      label="Conditions (JSON)"
                      inputProps={{
                        type: 'text',
                        placeholder: '{"field": "value"}',
                        ...createForm.register(`transitions.${index}.conditionsJson`),
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <FormField
                      label="Actions (JSON)"
                      inputProps={{
                        type: 'text',
                        placeholder: '{"notify": "manager"}',
                        ...createForm.register(`transitions.${index}.actionsJson`),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions form-actions-row">
          <Button type="button" variant="default" onClick={() => void createForm.handleSubmit(runCreate)()} disabled={submitting || authLoading || !user}>
            {submitting ? t('workflows.submitting') : t('workflows.createVersion')}
          </Button>
        </div>

        <OperationResult
          status={status}
          successLabel={t('workflows.result.title')}
          errorTitle={t('workflows.result.errorTitle')}
          onError={submitError?.message}
          errorCode={submitError?.code}
          errorDetails={submitError?.details}
          requestId={submitError?.requestId}
          fields={result ? [
            { label: t('workflows.result.id'), value: result.id },
            { label: t('workflows.result.version'), value: result.version.toString() },
            { label: t('workflows.result.status'), value: result.status },
          ] : undefined}
        />
      </form>

      <form className="settings-card" noValidate style={{ marginTop: '2rem' }}>
        <div className="settings-card-heading">
          <span className="settings-icon" aria-hidden="true"><UploadCloud size={18} /></span>
          <div>
            <h2>{t('workflows.sections.publish')}</h2>
            <p>Publish a draft version to make it effective.</p>
          </div>
        </div>
        
        <div className="form-grid">
          <FormSelect
            label={t('workflows.labels.versionId')}
            error={publishForm.formState.errors.versionId ? t(`form.errors.${publishForm.formState.errors.versionId.message}`) : undefined}
            options={workflows.flatMap(w => (w.versions || []).filter(v => v.status === 'DRAFT').map(v => ({ label: `${w.name} (v${v.version})`, value: v.id })))}
            selectProps={{
              ...publishForm.register('versionId'),
            }}
          />
        </div>

        <div className="form-actions form-actions-row">
          <Button type="button" variant="default" onClick={() => void publishForm.handleSubmit(runPublish)()} disabled={submitting || authLoading || !user}>
            {submitting ? t('workflows.submitting') : t('workflows.publish')}
          </Button>
        </div>
      </form>
    </>
  );
}
