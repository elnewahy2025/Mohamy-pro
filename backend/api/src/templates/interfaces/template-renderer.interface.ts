export interface TemplateSource {
  buffer: Buffer;
  mimeType: string;
}

export interface TemplateValidationResult {
  isValid: boolean;
  errors?: string[];
  detectedVariables?: string[];
}

export interface TemplateRenderInput {
  templateBuffer: Buffer;
  resolvedVariables: Record<string, any>;
}

export interface RenderedDocument {
  buffer: Buffer;
  mimeType: string;
}

export interface TemplateRenderer {
  validateTemplate(input: TemplateSource): Promise<TemplateValidationResult>;
  renderDocx(input: TemplateRenderInput): Promise<RenderedDocument>;
}
