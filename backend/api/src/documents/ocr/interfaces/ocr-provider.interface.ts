export interface OcrTextBlock {
  text: string;
  confidence: number;
  boundingBox?: number[]; // [x1, y1, x2, y2]
}

export interface OcrPageResult {
  pageNumber: number;
  blocks: OcrTextBlock[];
  fullText: string;
  averageConfidence: number;
}

export interface OcrProvider {
  /**
   * Processes a document image stream and returns structured OCR results.
   */
  processImage(imageStream: NodeJS.ReadableStream): Promise<OcrPageResult>;

  getProviderName(): string;
  getModelVersion(): string;
}
