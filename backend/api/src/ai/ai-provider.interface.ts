/**
 * Platform-defined AI provider contract (Phase 32 plan §AI Layer).
 *
 * Live providers are deferred: no implementation ships in v1 because no
 * provider credentials exist in this environment. When a provider lands
 * (behind the Integration Hub + Vault), it implements this interface and the
 * deferred executor fills `outputText`, moving requests QUEUED → READY.
 * Nothing else in the codebase may call provider SDKs directly.
 */

export interface AiProviderInput {
  taskType: string;
  refs: Array<{ kind: string; id: string; snapshot: Record<string, unknown> }>;
  promptHint?: string;
}

export interface AiProviderOutput {
  text: string;
  meta?: Record<string, unknown>;
}

export interface AiProvider {
  readonly key: string;
  execute(input: AiProviderInput): Promise<AiProviderOutput>;
}
