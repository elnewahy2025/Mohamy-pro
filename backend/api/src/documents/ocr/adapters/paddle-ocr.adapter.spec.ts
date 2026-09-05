import { PaddleOcrAdapter } from './paddle-ocr.adapter';
import { OcrUnavailableError } from '../ocr-unavailable.error';

describe('PaddleOcrAdapter', () => {
  it('fails closed instead of persisting fabricated extraction text', async () => {
    const adapter = new PaddleOcrAdapter();

    await expect(adapter.processImage({} as any)).rejects.toBeInstanceOf(
      OcrUnavailableError,
    );
  });
});
