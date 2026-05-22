// src/modules/whatsapp/controllers/webhook.controller.ts
import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const whatsappService = new WhatsAppService();

// Almacenamiento temporal de estados de conversación (en producción usar Redis)
const userStates: Map<string, { state: string; serviceId?: string; appointmentData?: any }> = new Map();

export class WhatsAppWebhookController {
  
  // GET /webhook/whatsapp - Verificación del webhook
  static verifyWebhook(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Webhook verificado correctamente');
      res.status(200).send(challenge);
    } else {
      console.log('❌ Error de verificación del webhook');
      res.sendStatus(403);
    }
  }
  
  // POST /webhook/whatsapp - Recepción de mensajes
  static async handleWebhook(req: Request, res: Response) {
    try {
      const body = req.body;
      
      // Verificar que sea un evento de mensaje
      if (body.object === 'whatsapp_business_account') {
        const entries = body.entry;
        
        for (const entry of entries) {
          const changes = entry.changes;
          
          for (const change of changes) {
            if (change.field === 'messages') {
              const messages = change.value.messages;
              
              if (messages && messages.length > 0) {
                for (const message of messages) {
                  await this.processMessage(message, change.value.contacts?.[0]);
                }
              }
            }
          }
        }
      }
      
      res.sendStatus(200);
    } catch (error) {
      console.error('Error en webhook:', error);
      res.sendStatus(500);
    }
  }
  
  // Procesar mensaje entrante
  private static async processMessage(message: any, contact: any) {
    const from = message.from; // Número de teléfono del cliente
    const senderName = contact?.profile?.name || 'Cliente';
    const messageType = message.type;
    
    console.log(`📨 Mensaje de ${senderName} (${from}):`, message);
    
    // Obtener o crear conversación en base de datos
    let conversation = await prisma.conversation.findFirst({
      where: {
        channel: 'WHATSAPP',
        externalId: from
      }
    });
    
    if (!conversation) {
      const tenant = await prisma.tenant.findFirst();
      conversation = await prisma.conversation.create({
        data: {
          tenantId: tenant!.id,
          channel: 'WHATSAPP',
          externalId: from,
          customerName: senderName,
          customerPhone: from,
          state: 'WELCOME'
        }
      });
      console.log(`📝 Nueva conversación creada para ${senderName}`);
    }
    
    // Guardar mensaje entrante
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        content: message.text?.body || 'Mensaje sin texto',
        metadata: message
      }
    });
    
    // Procesar según el tipo de mensaje
    if (messageType === 'text') {
      const userText = message.text.body.toLowerCase();
      await this.handleTextMessage(from, userText, conversation);
      
    } else if (messageType === 'interactive') {
      const interactiveType = message.interactive.type;
      
      if (interactiveType === 'button_reply') {
        const buttonId = message.interactive.button_reply.id;
        await this.handleButtonReply(from, buttonId, conversation);
        
      } else if (interactiveType === 'list_reply') {
        const listId = message.interactive.list_reply.id;
        await this.handleListReply(from, listId, conversation);
      }
    }
  }
  
  // Manejar mensajes de texto
  private static async handleTextMessage(from: string, text: string, conversation: any) {
    const currentState = conversation.state;
    
    // Obtener estado de usuario en memoria
    let userState = userStates.get(from);
    
    switch (currentState) {
      case 'WELCOME':
        // Enviar mensaje de bienvenida
        await whatsappService.sendTextMessage(
          from,
          `¡Hola! 👋 Bienvenido a la peluquería.\n\n` +
          `¿Qué te gustaría hacer?\n` +
          `1️⃣ Ver servicios disponibles\n` +
          `2️⃣ Reservar un turno\n` +
          `3️⃣ Consultar precios`
        );
        userStates.set(from, { state: 'MAIN_MENU' });
        break;
        
      case 'SELECTING_SERVICE':
        // Buscar servicio por nombre
        const service = await prisma.service.findFirst({
          where: {
            name: { contains: text, mode: 'insensitive' },
            isActive: true
          }
        });
        
        if (service) {
          userStates.set(from, { state: 'SELECTING_DATE', serviceId: service.id });
          await whatsappService.sendTextMessage(
            from,
            `✅ Servicio seleccionado: *${service.name}*\n` +
            `💰 Precio: $${service.price}\n` +
            `💵 Seña: $${service.deposit}\n` +
            `⏱️ Duración: ${service.durationMins} minutos\n\n` +
            `📅 ¿Qué día querés venir? (Ej: "mañana 10am" o "viernes 15:30")`
          );
        } else {
          await whatsappService.sendTextMessage(
            from,
            `❌ No encontré "${text}". ¿Querés ver la lista de servicios?`
          );
        }
        break;
        
      default:
        await whatsappService.sendTextMessage(
          from,
          `¿En qué puedo ayudarte? Enviá "menu" para ver las opciones.`
        );
    }
  }
  
  // Manejar respuestas de botones
  private static async handleButtonReply(from: string, buttonId: string, conversation: any) {
    switch (buttonId) {
      case 'view_services':
        const services = await prisma.service.findMany({ where: { isActive: true } });
        await whatsappService.sendServiceList(from, services);
        
        // Actualizar estado
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { state: 'SELECTING_SERVICE' }
        });
        userStates.set(from, { state: 'SELECTING_SERVICE' });
        break;
        
      case 'book_appointment':
        const availableServices = await prisma.service.findMany({ where: { isActive: true } });
        await whatsappService.sendServiceList(from, availableServices);
        
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { state: 'SELECTING_SERVICE' }
        });
        userStates.set(from, { state: 'SELECTING_SERVICE' });
        break;
    }
  }
  
  // Manejar selección de lista
  private static async handleListReply(from: string, listId: string, conversation: any) {
    const service = await prisma.service.findUnique({
      where: { id: listId }
    });
    
    if (service) {
      await whatsappService.sendTextMessage(
        from,
        `✅ Elegiste *${service.name}*\n\n` +
        `💰 Precio: $${service.price}\n` +
        `💵 Seña: $${service.deposit}\n\n` +
        `📅 Decime qué día y horario preferís.`
      );
      
      userStates.set(from, { state: 'SELECTING_DATE', serviceId: service.id });
    }
  }
}