import { Injectable, Logger } from '@nestjs/common';
import type {
  DocumentConversionProvider,
  ConversionInput,
  ConvertedDocument,
} from '../interfaces/document-conversion-provider.interface';
import { RendererUnavailableError } from '../renderer-unavailable.error';

@Injectable()
export class LibreofficeConversionProvider implements DocumentConversionProvider {
  private readonly logger = new Logger(LibreofficeConversionProvider.name);

  async convertDocxToPdf(input: ConversionInput): Promise<ConvertedDocument> {
    void input;
    this.logger.error('DOCX-to-PDF conversion called without a worker');
    throw new RendererUnavailableError();
  }
}
