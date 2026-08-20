export interface ServiceInfoContract {
  service: string;
  status: 'ok';
  version: string;
  timestamp: string;
}

export type DependencyState = 'up' | 'down';

export interface DependencyHealthContract {
  status: DependencyState;
  durationMs: number;
  error?: string;
}

export interface ReadinessContract {
  status: 'ok' | 'degraded';
  timestamp: string;
  checks: Record<string, DependencyHealthContract>;
}
