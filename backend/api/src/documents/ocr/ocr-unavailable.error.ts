export class OcrUnavailableError extends Error {
  constructor(reason: string) {
    super(`OCR pipeline is not wired: ${reason}`);
    this.name = 'OcrUnavailableError';
  }
}
