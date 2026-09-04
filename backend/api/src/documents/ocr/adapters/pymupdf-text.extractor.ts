import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentTextExtractor,
  ExtractedPageText,
} from '../interfaces/document-text-extractor.interface';

@Injectable()
export class PyMuPdfTextExtractor implements DocumentTextExtractor {
  private readonly logger = new Logger(PyMuPdfTextExtractor.name);

  async extractText(
    documentStream: NodeJS.ReadableStream,
  ): Promise<ExtractedPageText[]> {
    this.logger.log('Attempting native PDF text extraction with PyMuPDF...');
    // In production, this would call a Python service running `fitz` (PyMuPDF)

    // Simulating insufficient text scenario (requiring OCR fallback)
    return [];
  }
}
