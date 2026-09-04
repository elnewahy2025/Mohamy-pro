export interface TemplateResolutionContext {
  tenantId: string;
  userId: string;
  caseId?: string;
  clientId?: string;
  manualVariables?: Record<string, any>;
}

export interface ResolvedTemplateValue {
  key: string;
  value: any;
}

export interface TemplateVariableResolver {
  resolve(
    variableKey: string,
    context: TemplateResolutionContext,
  ): Promise<ResolvedTemplateValue>;
  resolveMultiple(
    variableKeys: string[],
    context: TemplateResolutionContext,
  ): Promise<Record<string, any>>;
}
