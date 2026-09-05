import { Module } from '@nestjs/common';
import { OcrProcessingService } from './ocr-processing.service';
import { HumanReviewService } from './human-review.service';
import { OcrController } from './ocr.controller';
import { PaddleOcrAdapter } from './adapters/paddle-ocr.adapter';
import { PyMuPdfTextExtractor } from './adapters/pymupdf-text.extractor';
import { SpacyEntityExtractor } from './adapters/spacy-entity.extractor';
import { DatabaseModule } from '../../infrastructure/database/database.module';
import { AuthModule } from '../../auth/auth.module';

import { OcrWorkerProcessor } from './ocr-worker.processor';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [OcrController],
  providers: [
    OcrProcessingService,
    HumanReviewService,
    OcrWorkerProcessor,
    { provide: 'OcrProvider', useClass: PaddleOcrAdapter },
    { provide: 'DocumentTextExtractor', useClass: PyMuPdfTextExtractor },
    { provide: 'EntityExtractor', useClass: SpacyEntityExtractor },
  ],
  exports: [OcrProcessingService, HumanReviewService],
})
export class OcrModule {}
