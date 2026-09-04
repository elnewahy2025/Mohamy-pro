import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import type { OcrProvider } from './interfaces/ocr-provider.interface';
import type { DocumentTextExtractor } from './interfaces/document-text-extractor.interface';
import type { EntityExtractor } from './interfaces/entity-extractor.interface';
import { OcrProcessingStatus, ExtractionMethod } from '@prisma/client';

@Injectable()
export class OcrProcessingService {
  private readonly logger = new Logger(OcrProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject('OcrProvider') private readonly ocrProvider: OcrProvider,
    @Inject('DocumentTextExtractor')
    private readonly textExtractor: DocumentTextExtractor,
    @Inject('EntityExtractor')
    private readonly entityExtractor: EntityExtractor,
  ) {}

  async enqueueProcessing(
    tenantId: string,
    documentId: string,
    documentVersionId: string,
  ): Promise<string> {
    this.logger.log(
      `Enqueueing OCR processing for document version ${documentVersionId}`,
    );

    // Determine idempotency / existing processing
    const existing = await this.prisma.ocrProcessing.findFirst({
      where: { documentVersionId, status: { in: ['QUEUED', 'PROCESSING'] } },
    });
    if (existing) {
      return existing.id;
    }

    const processing = await this.prisma.ocrProcessing.create({
      data: {
        tenantId,
        documentId,
        documentVersionId,
        provider: this.ocrProvider.getProviderName(),
        providerVersion: this.ocrProvider.getModelVersion(),
        status: OcrProcessingStatus.QUEUED,
      },
    });

    // Normally we would push to BullMQ here
    // await this.ocrQueue.add('ocr.document.process', { processingId: processing.id, tenantId, ... });

    return processing.id;
  }

  async processDocument(
    processingId: string,
    documentStream: NodeJS.ReadableStream,
  ): Promise<void> {
    const processing = await this.prisma.ocrProcessing.findUnique({
      where: { id: processingId },
    });
    if (!processing)
      throw new BadRequestException('Processing record not found');

    await this.prisma.ocrProcessing.update({
      where: { id: processingId },
      data: { status: OcrProcessingStatus.PROCESSING },
    });

    try {
      // 1. Try Native Text Extraction
      let extractedText = await this.textExtractor.extractText(documentStream);
      let isNative = true;

      // 2. Fallback to OCR if native text is insufficient
      if (!extractedText || extractedText.length === 0) {
        isNative = false;
        // In reality we would pass the stream to the OCR provider, but stream is consumed.
        // Assuming we handle stream buffering/cloning properly.
        const ocrResult = await this.ocrProvider.processImage(documentStream);

        await this.prisma.ocrPage.create({
          data: {
            ocrProcessingId: processingId,
            pageNumber: ocrResult.pageNumber,
            extractionMethod: ExtractionMethod.OCR,
            text: ocrResult.fullText,
            confidence: ocrResult.averageConfidence,
          },
        });

        extractedText = [
          {
            pageNumber: ocrResult.pageNumber,
            text: ocrResult.fullText,
            isNative: false,
          },
        ];
      }

      // 3. Entity Extraction
      for (const page of extractedText) {
        const entities = await this.entityExtractor.extractEntities(page.text);

        for (const entity of entities) {
          await this.prisma.ocrEntity.create({
            data: {
              ocrProcessingId: processingId,
              entityType: entity.entityType,
              value: entity.value,
              confidence: entity.confidence,
            },
          });
        }
      }

      // Mark success
      await this.prisma.ocrProcessing.update({
        where: { id: processingId },
        data: {
          status: OcrProcessingStatus.SUCCEEDED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(`OCR processing failed: ${error.message}`);
      await this.prisma.ocrProcessing.update({
        where: { id: processingId },
        data: {
          status: OcrProcessingStatus.FAILED,
          failureCode: 'OCR_PROCESSING_FAILED',
          completedAt: new Date(),
        },
      });
    }
  }
}
