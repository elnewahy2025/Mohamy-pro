import { Injectable, Logger } from '@nestjs/common';
import {
  OcrProvider,
  OcrPageResult,
} from '../interfaces/ocr-provider.interface';

@Injectable()
export class PaddleOcrAdapter implements OcrProvider {
  private readonly logger = new Logger(PaddleOcrAdapter.name);

  async processImage(
    imageStream: NodeJS.ReadableStream,
  ): Promise<OcrPageResult> {
    this.logger.log('Processing image with PaddleOCR...');
    // In production, this would call a self-hosted PaddleOCR Python microservice
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      pageNumber: 1,
      fullText: 'Simulated PaddleOCR extraction result.',
      averageConfidence: 0.95,
      blocks: [
        { text: 'Simulated', confidence: 0.98 },
        { text: 'PaddleOCR', confidence: 0.96 },
        { text: 'extraction', confidence: 0.92 },
        { text: 'result.', confidence: 0.94 },
      ],
    };
  }

  getProviderName(): string {
    return 'PaddleOCR';
  }

  getModelVersion(): string {
    return 'v2.6.0';
  }
}
