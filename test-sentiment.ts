import { sentimentAnalyzer } from './src/modules/messaging/processors/sentiment.analyzer';

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
  console.log(`📨 "${msg}"`);
  console.log(`   → ${result.mood} (score: ${result.score.toFixed(2)})`);
  console.log(`   → Requiere atención: ${result.requiresAttention ? "⚠️ SÍ" : "✅ No"}`);
  console.log('');
}
