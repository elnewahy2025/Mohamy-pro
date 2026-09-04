import { Injectable, Logger } from '@nestjs/common';
import {
  EntityExtractor,
  ExtractedEntity,
} from '../interfaces/entity-extractor.interface';

@Injectable()
export class SpacyEntityExtractor implements EntityExtractor {
  private readonly logger = new Logger(SpacyEntityExtractor.name);

  async extractEntities(text: string): Promise<ExtractedEntity[]> {
    this.logger.log('Extracting entities using spaCy...');
    // In production, this would call a Python spaCy microservice

    if (!text) return [];

    return [
      {
        entityType: 'ORGANIZATION',
        value: 'Mohamy Pro',
        confidence: 0.98,
      },
      {
        entityType: 'DATE',
        value: '2026-09-04',
        confidence: 0.99,
      },
    ];
  }
}
