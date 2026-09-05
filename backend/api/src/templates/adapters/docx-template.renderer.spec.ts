import { DocxTemplateRenderer } from './docx-template.renderer';
import { LibreofficeConversionProvider } from './libreoffice-conversion.provider';
import { RendererUnavailableError } from '../renderer-unavailable.error';

describe('template scaffolds', () => {
  it('refuses to fabricate validation and rendered output', async () => {
    const renderer = new DocxTemplateRenderer();

    await expect(renderer.validateTemplate({} as any)).rejects.toBeInstanceOf(
      RendererUnavailableError,
    );
    await expect(renderer.renderDocx({} as any)).rejects.toBeInstanceOf(
      RendererUnavailableError,
    );
  });

  it('refuses to fabricate PDF conversions', async () => {
    const provider = new LibreofficeConversionProvider();

    await expect(provider.convertDocxToPdf({} as any)).rejects.toBeInstanceOf(
      RendererUnavailableError,
    );
  });
});
