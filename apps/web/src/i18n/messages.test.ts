import { describe, expect, it } from 'vitest';
import ar from '../../messages/ar.json';
import en from '../../messages/en.json';

function sortedKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value)
    .flatMap(([key, child]) => sortedKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

describe('localized frontend messages', () => {
  it('keeps English and Arabic message trees structurally identical', () => {
    expect(sortedKeys(ar)).toEqual(sortedKeys(en));
  });

  it('contains the complete bilingual navigation and direction labels', () => {
    expect(en.navigation).toEqual({
      overview: 'Overview',
      operations: 'Operations',
      organization: 'Organization',
      clients: 'Clients',
      parties: 'Parties',
      cases: 'Cases',
      hearings: 'Hearings',
      conflictChecks: 'Conflict checks',
      legalConfig: 'Legal configuration',
      workflows: 'Workflows',
      integrations: 'Integrations',
      settings: 'Settings',
      groups: {
        workspace: 'Workspace',
        clientsParties: 'Clients & Parties',
        matters: 'Matters',
        configuration: 'Configuration',
      },
    });
    expect(ar.navigation).toEqual({
      overview: 'نظرة عامة',
      operations: 'العمليات',
      organization: 'المؤسسة',
      clients: 'العملاء',
      parties: 'الأطراف',
      cases: 'القضايا',
      hearings: 'الجلسات',
      conflictChecks: 'فحص تضارب المصالح',
      legalConfig: 'الإعداد القانوني',
      workflows: 'سير العمل',
      integrations: 'التكاملات',
      settings: 'الإعدادات',
      groups: {
        workspace: 'مساحة العمل',
        clientsParties: 'العملاء والأطراف',
        matters: 'القضايا',
        configuration: 'الإعداد',
      },
    });
    expect(en.settings.ltr).toBe('LTR');
    expect(ar.settings.rtl).toBe('RTL');
  });

  it('localizes the identity/membership flows and accessible form errors in both languages', () => {
    const surfaces = [
      'identity.bootstrap',
      'identity.tenantSwitch',
      'identity.invitation',
      'identity.membershipAdmin',
      'form.errors',
    ] as const;
    for (const surface of surfaces) {
      expect(en).toHaveProperty(surface);
      expect(ar).toHaveProperty(surface);
    }
    expect(typeof en.identity.bootstrap.title).toBe('string');
    expect(typeof ar.identity.bootstrap.title).toBe('string');
    expect(typeof en.identity.tenantSwitch.title).toBe('string');
    expect(typeof ar.identity.tenantSwitch.title).toBe('string');
    expect(typeof en.identity.invitation.createTitle).toBe('string');
    expect(typeof ar.identity.invitation.createTitle).toBe('string');
    expect(typeof en.identity.membershipAdmin.suspend).toBe('string');
    expect(typeof ar.identity.membershipAdmin.suspend).toBe('string');
    expect(typeof en.form.errors.invalidUuid).toBe('string');
    expect(typeof ar.form.errors.invalidUuid).toBe('string');
  });
});
