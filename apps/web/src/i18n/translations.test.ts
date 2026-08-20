import { describe, expect, it } from 'vitest';
import { translations } from './translations';

describe('translations', () => {
  it('provides complete directional resources for English and Arabic', () => {
    expect(translations.en.direction).toBe('ltr');
    expect(translations.ar.direction).toBe('rtl');
    expect(translations.en.navigation.overview).toBeTruthy();
    expect(translations.ar.navigation.overview).toBeTruthy();
    expect(translations.en.overview.title).toBeTruthy();
    expect(translations.ar.overview.title).toBeTruthy();
  });
});
