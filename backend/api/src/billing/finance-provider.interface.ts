export interface FinanceProviderChargeInput {
  paymentId: string;
  amountMinor: string;
  currency: string;
  providerRef?: string;
}

export interface FinanceProviderChargeResult {
  providerRef: string;
  status: 'SUCCEEDED' | 'FAILED';
}

/**
 * Real money movement is deferred (Phase 21 plan §8). Providers implement
 * this interface when a PSP is wired; until then no implementation exists
 * and every charge path fails closed at the service layer.
 */
export interface FinanceProvider {
  charge(
    input: FinanceProviderChargeInput,
  ): Promise<FinanceProviderChargeResult>;
}
