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
      integrations: 'Integrations',
      settings: 'Settings',
    });
    expect(ar.navigation).toEqual({
      overview: 'نظرة عامة',
      operations: 'العمليات',
      integrations: 'التكاملات',
      settings: 'الإعدادات',
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
