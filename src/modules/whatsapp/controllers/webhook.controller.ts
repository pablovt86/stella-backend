// src/modules/whatsapp/controllers/webhook.controller.ts
import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const whatsappService = new WhatsAppService();

const userStates: Map<string, { state: string; serviceId?: string; appointmentData?: any }> = new Map();

export class WhatsAppWebhookController {
  
  // GET /webhook/whatsapp - Verificación del webhook (SOLO GET)
  static verifyWebhook(req: Request, res: Response): void {
    // Solo procesamos GET
    if (req.method !== 'GET') {
      console.log('⚠️ Método no GET en verifyWebhook:', req.method);
      res.status(200).send('OK');
      return;
    }
    
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const challenge = req.query['hub.challenge'] as string;
    
    console.log('🔍 Verificación de webhook (GET):');
    console.log('   mode:', mode);
    console.log('   token:', token);
    console.log('   challenge:', challenge);
    
    const expectedToken = 'peluqueria123';
    
    if (challenge) {
      console.log('✅ Challenge detectado, respondiendo con:', challenge);
      res.status(200).send(challenge);
      return;
    }
    
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('✅ Webhook verificado correctamente');
      res.status(200).send(challenge || 'OK');
      return;
    }
    
    console.log('⚠️ Solicitud GET sin parámetros, respondiendo OK');
    res.status(200).send('OK');
  }

  // POST /webhook/whatsapp - Recepción de mensajes
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      console.log('📩 Webhook POST recibido');
      res.sendStatus(200);
    } catch (error) {
      console.error('❌ Error en webhook:', error);
      res.sendStatus(500);
    }
  }
}