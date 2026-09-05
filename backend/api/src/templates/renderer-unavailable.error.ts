export class RendererUnavailableError extends Error {
  constructor() {
    super(
      'Document renderer is not wired: connect docxtemplater/LibreOffice workers before rendering',
    );
    this.name = 'RendererUnavailableError';
  }
}
