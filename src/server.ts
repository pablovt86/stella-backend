import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';  // ✅ Agregar esta línea
import { PrismaClient } from '@prisma/client';
import { WhatsAppWebhookController } from './modules/whatsapp/controllers/webhook.controller';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ✅ CORS - Permite que el frontend (puerto 5173) hable con el backend
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:5173', 'http://192.168.1.44:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== ENDPOINTS EXISTENTES ====================

// Ruta de prueba
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Obtener todos los servicios
app.get('/api/services', async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const services = await prisma.service.findMany();
    res.json({ success: true, data: services });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener servicios' });
  }
});

// Obtener un servicio por ID
app.get('/api/services/:id', async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const service = await prisma.service.findUnique({
      where: { id: req.params.id }
    });
    
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    }
    
    res.json({ success: true, data: service });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener servicio' });
  }
});

// Crear una cita
app.post('/api/appointments', async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, serviceId, dateTime } = req.body;
    const prisma = new PrismaClient();
    
    const service = await prisma.service.findUnique({
      where: { id: serviceId }
    });
    
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    }
    
    const tenant = await prisma.tenant.findFirst();
    
    const appointment = await prisma.appointment.create({
      data: {
        customerName,
        customerPhone,
        customerEmail,
        serviceId,
        dateTime: new Date(dateTime),
        durationMins: service.durationMins,
        depositAmount: service.deposit,
        status: 'PENDING',
        depositStatus: 'NOT_PAID',
        tenantId: tenant!.id
      },
      include: { service: true }
    });
    
    res.json({ success: true, data: appointment });
    
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener todas las citas
app.get('/api/appointments', async (req, res) => {
  try {
    const prisma = new PrismaClient();
    
    const appointments = await prisma.appointment.findMany({
      include: { service: true },
      orderBy: { dateTime: 'asc' }
    });
    
    res.json({ success: true, data: appointments });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: 'Error al obtener citas' });
  }
});


// Dashboard de sentimiento
// app.get('/api/analytics/sentiment', async (req, res) => {
//   try {
//     const prisma = new PrismaClient();
//     const { days = 7 } = req.query;
    
//     const startDate = new Date();
//     startDate.setDate(startDate.getDate() - Number(days));
    
//     const stats = await prisma.sentimentAnalysis.groupBy({
//       by: ['sentiment_label', 'severity'],
//       where: {
//         createdAt: { gte: startDate }
//       },
//       _count: true
//     });
    
//     const recentAlerts = await prisma.sentimentAnalysis.findMany({
//       where: {
//         severity: { in: ['high', 'critical'] },
//         createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
//       },
//       orderBy: { createdAt: 'desc' },
//       take: 10,
//       include: { conversation: true }
//     });
    
//     res.json({
//       success: true,
//       data: {
//         summary: stats,
//         alerts: recentAlerts,
//         period: `${days} días`
//       }
//     });
    
//   } catch (error: any) {
//     res.status(500).json({ success: false, error: error.message });
//   }
// });



// ==================== MERCADOPAGO ====================

app.post('/api/payments/create/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const prisma = new PrismaClient();
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true }
    });
    
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }
    
    const paymentUrl = `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=test-${appointmentId}`;
    
    res.json({ 
      success: true, 
      paymentUrl: paymentUrl,
      amount: appointment.depositAmount,
      message: 'Modo sandbox - Integración pendiente'
    });
    
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/payments/status/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const prisma = new PrismaClient();
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId }
    });
    
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }
    
    res.json({ 
      success: true, 
      status: appointment.depositStatus,
      message: appointment.depositStatus === 'PAID' ? 'Pago confirmado' : 'Pago pendiente'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== WHATSAPP WEBHOOKS ====================

app.get('/webhook/whatsapp', WhatsAppWebhookController.verifyWebhook);
app.post('/webhook/whatsapp', WhatsAppWebhookController.handleWebhook);

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { to, message } = req.body;
    const { WhatsAppService } = require('./modules/whatsapp/services/whatsapp.service');
    const whatsappService = new WhatsAppService();
    const result = await whatsappService.sendTextMessage(to, message);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// ==================== WEBHOOKS PARA BOTPRESS ====================
// Estos endpoints son llamados desde Botpress (WhatsApp/Telegram)
// para crear turnos, verificar disponibilidad, etc.

// 1. Obtener servicios disponibles (para mostrar en el chat)
app.post('/api/botpress/services', async (req, res) => {
  try {
    const { category } = req.body;
    const prisma = new PrismaClient();
    
    const services = await prisma.service.findMany({
      where: {
        isActive: true,
        ...(category && category !== 'todos' ? { category } : {})
      }
    });
    
    res.json({
      success: true,
      services: services.map(s => ({
        id: s.id,
        name: s.name,
        price: s.price,
        duration: s.durationMins,
        deposit: s.deposit
      }))
    });
  } catch (error: any) {
    console.error('Error en /api/botpress/services:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Verificar disponibilidad de un turno (para evitar dobles reservas)
app.post('/api/botpress/check-availability', async (req, res) => {
  try {
    const { serviceId, date, time } = req.body;
    const prisma = new PrismaClient();
    
    const dateTime = new Date(`${date}T${time}:00`);
    
    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        serviceId,
        dateTime,
        status: { not: 'CANCELLED' }
      }
    });
    
    res.json({
      success: true,
      available: !existingAppointment
    });
  } catch (error: any) {
    console.error('Error en /api/botpress/check-availability:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Crear un turno (con HOLD de 15 minutos para pagar la seña)
//    Este es el endpoint PRINCIPAL que Botpress llama
// 3. Crear un turno (desde Botpress)
// Crear un turno desde Botpress (con HOLD de 15 minutos)
app.post('/api/botpress/create-appointment', async (req, res) => {
  try {
    console.log('📥 Webhook de Botpress recibido:', req.body);
    
    const { serviceId, customerName, customerPhone, customerEmail, date, time } = req.body;
    const prisma = new PrismaClient();
    
    // Buscar el servicio
    const service = await prisma.service.findUnique({
      where: { id: serviceId || 'corte-caballero' }
    });
    
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    }
    
    // Buscar el tenant
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant no encontrado' });
    }
    
    // Crear fecha y hora
    const dateTime = new Date(`${date || '2026-05-25'}T${time || '15:00'}:00`);
    
    // Calcular expiración (15 minutos)
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
    // Crear el turno
    const appointment = await prisma.appointment.create({
      data: {
        tenantId: tenant.id,
        serviceId: service.id,
        customerName: customerName || 'Cliente Botpress',
        customerPhone: customerPhone || '0000000000',
        customerEmail: customerEmail || null,
        dateTime: dateTime,
        durationMins: service.durationMins,
        depositAmount: service.deposit,
        status: 'PENDING',
        depositStatus: 'NOT_PAID',
        holdExpiresAt: holdExpiresAt   // ← AHORA SÍ FUNCIONA
      }
    });
    
    console.log('✅ Turno creado:', appointment.id);
    console.log('⏰ Expira:', holdExpiresAt);
    
    res.json({
      success: true,
      appointment: {
        id: appointment.id,
        service: service.name,
        dateTime: appointment.dateTime,
        depositAmount: appointment.depositAmount,
        holdExpiresAt: holdExpiresAt
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// 4. Webhook para análisis de sentimiento (opcional)
app.post('/api/sentiment/analyze', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Texto requerido' });
    }
    
    // Importar el analizador de sentimiento
    const { sentimentAnalyzer } = require('./modules/messaging/processors/sentiment.analyzer');
    const result = sentimentAnalyzer.analyze(text);
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error en /api/sentiment/analyze:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});





// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/services`);
  console.log(`   GET  /api/services/:id`);
  console.log(`   POST /api/appointments`);
  console.log(`   GET  /api/appointments`);
  console.log(`   POST /api/payments/create/:appointmentId`);
  console.log(`   GET  /api/payments/status/:appointmentId`);
});