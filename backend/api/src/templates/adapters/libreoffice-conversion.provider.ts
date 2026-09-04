import { Injectable, Logger } from '@nestjs/common';
import type {
  DocumentConversionProvider,
  ConversionInput,
  ConvertedDocument,
} from '../interfaces/document-conversion-provider.interface';

@Injectable()
export class LibreofficeConversionProvider implements DocumentConversionProvider {
  private readonly logger = new Logger(LibreofficeConversionProvider.name);

  async convertDocxToPdf(input: ConversionInput): Promise<ConvertedDocument> {
    this.logger.debug(
      `Converting document of type ${input.sourceMimeType} to PDF`,
    );

    // In a real implementation, this would orchestrate a call to a headless LibreOffice worker.

    return {
      buffer: Buffer.from('Mock PDF content'),
      mimeType: 'application/pdf',
    };
  }
}
