export interface ProviderDispatchInput {
  messageId: string;
  channel: string;
  recipient: string;
  subject?: string;
  body: string;
}

export interface ProviderDispatchResult {
  providerMessageId: string;
  status: 'SENT' | 'FAILED';
}

/**
 * Real sending is deferred (Phase 22 plan §7). Providers implement this
 * interface when Email/SMS/WhatsApp integrations land; until then no
 * implementation exists and outbound messages rest at QUEUED.
 */
export interface CommunicationProvider {
  send(input: ProviderDispatchInput): Promise<ProviderDispatchResult>;
}
