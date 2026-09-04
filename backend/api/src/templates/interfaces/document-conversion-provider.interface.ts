export interface ConversionInput {
  buffer: Buffer;
  sourceMimeType: string;
}

export interface ConvertedDocument {
  buffer: Buffer;
  mimeType: string;
}

export interface DocumentConversionProvider {
  convertDocxToPdf(input: ConversionInput): Promise<ConvertedDocument>;
}
