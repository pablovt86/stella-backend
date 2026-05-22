const { sentimentAnalyzer } = require("./src/modules/messaging/processors/sentiment.analyzer.js");

const testMessages = [
  "Excelente servicio, muy buena atención, volveré",
  "Pésimo, me cancelaron el turno sin aviso",
  "Me gustaría reservar un turno para mañana",
  "Estoy muy enojado, llevo media hora esperando",
  "Gracias por la atención, todo perfecto"
];

console.log("🧪 Probando análisis de sentimiento\n");

for (const msg of testMessages) {
  const result = sentimentAnalyzer.analyze(msg);
  let icon = "😐";
  if (result.mood === "very_positive") icon = "🎉";
  else if (result.mood === "positive") icon = "😊";
  else if (result.mood === "negative") icon = "😟";
  else if (result.mood === "very_negative") icon = "😠";
  
  console.log(`${icon} "${msg}"`);
  console.log(`   → ${result.mood} (score: ${result.score})`);
  console.log(`   → Atención humana: ${result.requiresAttention ? "⚠️ SÍ" : "✅ No"}`);
  console.log("");
}
