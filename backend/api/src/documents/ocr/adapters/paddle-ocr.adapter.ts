import { Injectable, Logger } from '@nestjs/common';
import {
  OcrProvider,
  OcrPageResult,
} from '../interfaces/ocr-provider.interface';
import { OcrUnavailableError } from '../ocr-unavailable.error';

@Injectable()
export class PaddleOcrAdapter implements OcrProvider {
  private readonly logger = new Logger(PaddleOcrAdapter.name);

  async processImage(
    imageStream: NodeJS.ReadableStream,
  ): Promise<OcrPageResult> {
    void imageStream;
    this.logger.error(
      'PaddleOCR called without a provider microservice: refusing to fabricate extraction text',
    );
    throw new OcrUnavailableError('PaddleOCR microservice is not connected');
  }

  getProviderName(): string {
    return 'PaddleOCR';
  }

  getModelVersion(): string {
    return 'v2.6.0';
  }
}
