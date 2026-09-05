import { Injectable, Logger } from '@nestjs/common';
import type {
  TemplateRenderer,
  TemplateSource,
  TemplateValidationResult,
  TemplateRenderInput,
  RenderedDocument,
} from '../interfaces/template-renderer.interface';
import { RendererUnavailableError } from '../renderer-unavailable.error';

@Injectable()
export class DocxTemplateRenderer implements TemplateRenderer {
  private readonly logger = new Logger(DocxTemplateRenderer.name);

  async validateTemplate(
    input: TemplateSource,
  ): Promise<TemplateValidationResult> {
    void input;
    this.logger.error('Template validation called without a renderer');
    throw new RendererUnavailableError();
  }

  async renderDocx(input: TemplateRenderInput): Promise<RenderedDocument> {
    void input;
    this.logger.error('DOCX rendering called without a renderer');
    throw new RendererUnavailableError();
  }
}
