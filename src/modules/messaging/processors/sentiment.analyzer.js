// sentiment.analyzer.js
const SPANISH_LEXICON = {
  "excelente": 3.0, "bueno": 1.5, "bien": 1.2, "perfecto": 3.0,
  "gracias": 1.0, "contento": 2.0, "satisfecho": 2.0, "genial": 2.2,
  "pésimo": -3.5, "horrible": -3.0, "malo": -2.5, "enojado": -2.5,
  "problema": -2.0, "error": -2.0, "tarde": -1.8, "demora": -1.8,
  "cancelaron": -2.5, "queja": -2.0, "reclamo": -2.0
};

const INTENSIFIERS = {
  "muy": 1.5, "demasiado": 1.8, "super": 1.6, "re": 1.4, "bastante": 1.3
};

class SentimentAnalyzer {
  analyze(text) {
    let rawScore = 0;
    const positiveMatches = [];
    const negativeMatches = [];
    
    const cleanText = text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .replace(/[á]/g, "a").replace(/[é]/g, "e").replace(/[í]/g, "i").replace(/[ó]/g, "o").replace(/[ú]/g, "u");
    
    const words = cleanText.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = i > 0 ? words[i - 1] : "";
      let multiplier = (prevWord && INTENSIFIERS[prevWord]) ? INTENSIFIERS[prevWord] : 1;
      
      if (SPANISH_LEXICON[word]) {
        const addScore = SPANISH_LEXICON[word] * multiplier;
        rawScore += addScore;
        if (addScore > 0) positiveMatches.push(word);
        if (addScore < 0) negativeMatches.push(word);
      }
    }
    
    if (/[😊😀😄😍👍🎉]/.test(text)) rawScore += 0.8;
    if (/[😠😡🤬😤👎😢😭]/.test(text)) rawScore -= 1.0;
    
    const normalizedScore = Math.max(-1, Math.min(1, rawScore / 30));
    
    let mood, severity;
    if (normalizedScore >= 0.6) { mood = "very_positive"; severity = "low"; }
    else if (normalizedScore >= 0.2) { mood = "positive"; severity = "low"; }
    else if (normalizedScore >= -0.2) { mood = "neutral"; severity = "medium"; }
    else if (normalizedScore >= -0.6) { mood = "negative"; severity = "high"; }
    else { mood = "very_negative"; severity = "critical"; }
    
    return {
      score: normalizedScore,
      mood: mood,
      severity: severity,
      requiresAttention: severity === "critical" || severity === "high",
      details: {
        positiveMatches: [...new Set(positiveMatches)],
        negativeMatches: [...new Set(negativeMatches)]
      }
    };
  }
}

const sentimentAnalyzer = new SentimentAnalyzer();
module.exports = { sentimentAnalyzer, SentimentAnalyzer };
