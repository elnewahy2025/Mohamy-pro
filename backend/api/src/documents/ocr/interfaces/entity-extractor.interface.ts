export interface ExtractedEntity {
  entityType: string;
  value: string;
  normalizedValue?: string;
  confidence: number;
  startIndex?: number;
  endIndex?: number;
}

export interface EntityExtractor {
  extractEntities(text: string): Promise<ExtractedEntity[]>;
}
