export interface ExtractedPageText {
  pageNumber: number;
  text: string;
  isNative: boolean;
}

export interface DocumentTextExtractor {
  /**
   * Attempts to extract native text from a document (e.g. PDF).
   * Returns null or empty if the document requires OCR.
   */
  extractText(
    documentStream: NodeJS.ReadableStream,
  ): Promise<ExtractedPageText[]>;
}
