// src/modules/messaging/processors/sentiment.analyzer.ts

const SPANISH_LEXICON: Record<string, number> = {
  'pésimo': -3.5, 'horrible': -3.0, 'terrible': -3.0,
  'malo': -2.5, 'decepcionante': -2.5, 'enojado': -2.5,
  'mal': -2.0, 'problema': -2.0, 'error': -2.0,
  'tarde': -1.8, 'demora': -1.8, 'cancelaron': -2.5,
  'queja': -2.0, 'reclamo': -2.0, 'caro': -1.5,
  'bien': 1.2, 'bueno': 1.5, 'mejor': 1.5,
  'excelente': 3.0, 'perfecto': 3.0, 'genial': 2.2,
  'gracias': 1.0, 'contento': 2.0, 'satisfecho': 2.0,
  'rápido': 1.3, 'recomiendo': 1.5,
};

const INTENSIFIERS: Record<string, number> = {
  'muy': 1.5, 'demasiado': 1.8, 'super': 1.6, 're': 1.4, 'bastante': 1.3,
};

export interface SentimentResult {
  score: number;
  label: 'positive' | 'neutral' | 'negative';
  mood: 'very_negative' | 'negative' | 'neutral' | 'positive' | 'very_positive';
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  details: { rawScore: number; positiveMatches: string[]; negativeMatches: string[]; };
}

export class SentimentAnalyzer {
  analyze(text: string): SentimentResult {
    let rawScore = 0;
    const positiveMatches: string[] = [];
    const negativeMatches: string[] = [];
    
    const cleanText = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ');
    const words = cleanText.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = i > 0 ? words[i - 1] : '';
      let multiplier = prevWord && INTENSIFIERS[prevWord] ? INTENSIFIERS[prevWord] : 1;
      
      if (SPANISH_LEXICON[word]) {
        const addScore = SPANISH_LEXICON[word] * multiplier;
        rawScore += addScore;
        if (addScore > 0) positiveMatches.push(word);
        if (addScore < 0) negativeMatches.push(word);
      }
    }
    
    const normalizedScore = Math.max(-1, Math.min(1, rawScore / 30));
    let label: 'positive' | 'neutral' | 'negative' = 'neutral';
    let mood: any = 'neutral';
    let severity: any = 'medium';
    
    if (normalizedScore >= 0.6) { label = 'positive'; mood = 'very_positive'; severity = 'low'; }
    else if (normalizedScore >= 0.2) { label = 'positive'; mood = 'positive'; severity = 'low'; }
    else if (normalizedScore >= -0.2) { label = 'neutral'; mood = 'neutral'; severity = 'medium'; }
    else if (normalizedScore >= -0.6) { label = 'negative'; mood = 'negative'; severity = 'high'; }
    else { label = 'negative'; mood = 'very_negative'; severity = 'critical'; }
    
    return {
      score: normalizedScore,
      label, mood, severity,
      confidence: Math.min(0.95, Math.abs(normalizedScore) + 0.2),
      details: { rawScore, positiveMatches: [...new Set(positiveMatches)], negativeMatches: [...new Set(negativeMatches)] }
    };
  }
  
  requiresHumanAttention(text: string): boolean {
    const result = this.analyze(text);
    return result.severity === 'critical' || result.severity === 'high';
  }
}

export const sentimentAnalyzer = new SentimentAnalyzer();