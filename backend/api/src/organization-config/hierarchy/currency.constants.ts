export const CURRENCIES = [
  'EGP',
  'USD',
  'SAR',
  'AED',
  'KWD',
  'BHD',
  'QAR',
  'OMR',
  'JOD',
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number];
