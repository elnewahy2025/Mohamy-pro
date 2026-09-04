export interface ClassificationPrediction {
  category: string;
  confidence: number;
}

export interface DocumentClassifier {
  classifyText(text: string): Promise<ClassificationPrediction>;
}
