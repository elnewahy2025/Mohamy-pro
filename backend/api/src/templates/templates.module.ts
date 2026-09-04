import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateGenerationWorker } from './template-generation.worker';
import { TemplateController } from './template.controller';
import { TemplateGenerationController } from './template-generation.controller';
import { DocxTemplateRenderer } from './adapters/docx-template.renderer';
import { LibreofficeConversionProvider } from './adapters/libreoffice-conversion.provider';
import { DatabaseModule } from '../infrastructure/database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TemplateController, TemplateGenerationController],
  providers: [
    TemplateService,
    TemplateGenerationWorker,
    { provide: 'TemplateRenderer', useClass: DocxTemplateRenderer },
    {
      provide: 'DocumentConversionProvider',
      useClass: LibreofficeConversionProvider,
    },
  ],
  exports: [TemplateService],
})
export class TemplatesModule {}
