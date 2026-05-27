// backend/src/modules/messaging/processors/intelligent.router.ts

import { sentimentAnalyzer, SentimentResult } from './sentiment.analyzer';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class IntelligentRouter {
  
  async processMessage(tenantId: string, channel: string, senderId: string, text: string) {
    
    // 1. ANALIZAR SENTIMIENTO
    const sentiment = sentimentAnalyzer.analyze(text);
    
    console.log(`😊 Sentimiento: ${sentiment.mood} (score: ${sentiment.score})`);
    console.log(`   Positivo: ${sentiment.details.positiveMatches.join(', ')}`);
    console.log(`   Negativo: ${sentiment.details.negativeMatches.join(', ')}`);
    
    // 2. GUARDAR ANÁLISIS EN BASE DE DATOS
    await this.saveSentimentAnalysis(tenantId, senderId, text, sentiment, channel);
    
    // 3. VERIFICAR SI REQUIERE ATENCIÓN HUMANA INMEDIATA
    if (sentiment.requiresHumanAttention) {
      await this.notifyAdmin(tenantId, senderId, text, sentiment);
      return {
        autoResponse: sentimentAnalyzer.generateSentimentResponse(sentiment),
        action: 'ESCALATE',
        sentiment: sentiment
      };
    }
    
    // 4. VERIFICAR INTENCIÓN DEL MENSAJE
    const intent = await this.classifyIntent(text, sentiment);
    
    // 5. RESPUESTA PERSONALIZADA POR SENTIMIENTO (si aplica)
    const sentimentResponse = sentimentAnalyzer.generateSentimentResponse(sentiment);
    if (sentimentResponse && sentiment.mood !== 'neutral') {
      return {
        autoResponse: sentimentResponse,
        action: 'SENTIMENT_RESPONSE',
        sentiment: sentiment,
        intent: intent
      };
    }
    
    // 6. FLUJO NORMAL SEGÚN INTENCIÓN
    return this.routeByIntent(intent, sentiment, text);
  }
  
  private async classifyIntent(text: string, sentiment: SentimentResult): Promise<string> {
    const lowerText = text.toLowerCase();
    
    // Si está enojado, priorizar queja
    if (sentiment.mood === 'very_negative') return 'COMPLAINT';
    if (sentiment.mood === 'negative') return 'COMPLAINT';
    
    // Palabras clave para reservas
    if (lowerText.includes('reserv') || lowerText.includes('turno') || lowerText.includes('cita') ||
        lowerText.includes('quería') && (lowerText.includes('corte') || lowerText.includes('servicio'))) {
      return 'BOOKING';
    }
    
    // Cancelaciones
    if (lowerText.includes('cancel') || lowerText.includes('anular') || lowerText.includes('baja')) {
      return 'CANCELLATION';
    }
    
    // Precios
    if (lowerText.includes('precio') || lowerText.includes('cuesta') || lowerText.includes('valor') ||
        lowerText.includes('cuánto') || lowerText.includes('cuanto')) {
      return 'PRICE_INQUIRY';
    }
    
    // Horarios
    if (lowerText.includes('horario') || lowerText.includes('abren') || lowerText.includes('cierran') ||
        lowerText.includes('cuándo') || lowerText.includes('cuando')) {
      return 'HOURS_INQUIRY';
    }
    
    return 'GENERAL';
  }
  
  private routeByIntent(intent: string, sentiment: SentimentResult, text: string) {
    const routes: Record<string, any> = {
      'BOOKING': { handler: 'bookingFlow', urgency: 'normal', message: '📅 ¿Para qué día querés reservar?' },
      'CANCELLATION': { handler: 'cancellationFlow', urgency: 'high', message: 'Lamento que quieras cancelar. Dame el código de tu turno.' },
      'PRICE_INQUIRY': { handler: 'priceResponse', urgency: 'low', message: '💰 Estos son nuestros precios... ¿querés que los detalle?' },
      'HOURS_INQUIRY': { handler: 'hoursResponse', urgency: 'low', message: '⏰ Nuestro horario es de 9am a 8pm de lunes a sábado.' },
      'COMPLAINT': { handler: 'humanEscalation', urgency: 'critical', message: null },
      'GENERAL': { handler: 'generalResponse', urgency: 'normal', message: '¿En qué puedo ayudarte? Podés reservar un turno o consultar precios.' }
    };
    
    const route = routes[intent] || routes['GENERAL'];
    
    return {
      intent: intent,
      handler: route.handler,
      urgency: route.urgency,
      autoResponse: route.message,
      sentiment: sentiment
    };
  }
  
  private async saveSentimentAnalysis(tenantId: string, senderId: string, text: string, sentiment: SentimentResult, channel: string) {
    try {
      // Buscar o crear conversación
      let conversation = await prisma.conversation.findFirst({
        where: {
          tenantId: tenantId,
          channel: channel.toUpperCase(),
          externalId: senderId
        }
      });
      
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            tenantId: tenantId,
            channel: channel.toUpperCase(),
            externalId: senderId,
            customerName: 'Cliente',
            customerPhone: senderId,
            state: 'WELCOME'
          }
        });
      }
      
      // Guardar análisis de sentimiento
      await prisma.sentimentAnalysis.create({
        data: {
          conversationId: conversation.id,
          messageId: `msg_${Date.now()}`,
          messageText: text.substring(0, 500),
          sentiment_score: sentiment.score,
          sentiment_label: sentiment.label.toUpperCase(),
          sentiment_mood: sentiment.mood,
          severity: sentiment.severity,
          confidence: sentiment.confidence,
          positive_words: sentiment.details.positiveMatches.length,
          negative_words: sentiment.details.negativeMatches.length,
          keywords: sentiment.details.positiveMatches.concat(sentiment.details.negativeMatches),
          language: 'es'
        }
      });
      
    } catch (error) {
      console.error('Error guardando análisis:', error);
    }
  }
  
  private async notifyAdmin(tenantId: string, senderId: string, text: string, sentiment: SentimentResult) {
    // Aquí puedes enviar notificación al panel de admin o por email
    console.log(`🚨 ALERTA: Cliente ${senderId} con sentimiento ${sentiment.mood}`);
    console.log(`   Mensaje: ${text}`);
    
    // TODO: Enviar notificación por Telegram al admin
    // TODO: Crear alerta en base de datos
  }
}

export const intelligentRouter = new IntelligentRouter();