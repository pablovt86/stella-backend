import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { WhatsAppWebhookController } from './modules/whatsapp/controllers/webhook.controller';
import mercadopago from 'mercadopago';

dotenv.config();

// Configurar MercadoPago con tu token de prueba
(mercadopago as any).configure({
  access_token: process.env.MP_ACCESS_TOKEN || 'TEST-4325437722170573-052116-2c61f4e15d2cc8c33ea20200b9cbc65a-1770074697'
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS - Permite que el frontend hable con el backend
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:5173', 'http://192.168.1.44:8080', 'http://localhost'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== ENDPOINTS PÚBLICOS ====================

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




// Endpoint para crear pago
// ==================== MERCADOPAGO (VERSIÓN QUE SÍ FUNCIONA) ====================
app.post('/api/payments/create/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const prisma = new PrismaClient();

    // 1. Obtener los datos de la cita
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, tenant: true }
    });

    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }

    // 2. Crear la preferencia REAL en Mercado Pago
    const preference = {
      items: [
        {
          title: `Seña - ${appointment.service.name}`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: Number(appointment.depositAmount),
        },
      ],
      external_reference: appointmentId,
      back_urls: {
        success: `${process.env.BACKEND_URL}/api/payments/success`,
        failure: `${process.env.BACKEND_URL}/api/payments/failure`,
      },
      auto_return: 'approved',
    };

    const response = await mercadopago.preferences.create(preference);

    // 3. (Opcional) Guardar el registro en tu base de datos
    await prisma.payment.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId: appointment.id,
        amount: appointment.depositAmount,
        type: 'DEPOSIT',
        status: 'PENDING',
        provider: 'MERCADOPAGO',
        providerPaymentId: response.body.id,
      },
    });

    // 4. ¡Éxito! Devolver la URL real de Mercado Pago
    res.json({
      success: true,
      paymentUrl: response.body.init_point,
      preferenceId: response.body.id,
    });

  } catch (error: any) {
    console.error('Error al crear pago:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Error al crear el pago',
      detail: error.message,
    });
  }
});
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

app.post('/api/botpress/create-appointment', async (req, res) => {
  try {
    console.log('📥 Webhook de Botpress recibido:', req.body);
    
    const { serviceId, customerName, customerPhone, customerEmail, date, time } = req.body;
    const prisma = new PrismaClient();
    
    const service = await prisma.service.findUnique({
      where: { id: serviceId || 'corte-caballero' }
    });
    
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    }
    
    const tenant = await prisma.tenant.findFirst();
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant no encontrado' });
    }
    
    const dateTime = new Date(`${date || '2026-05-25'}T${time || '15:00'}:00`);
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    
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
        holdExpiresAt: holdExpiresAt
      }
    });
    
    console.log('✅ Turno creado:', appointment.id);
    
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

app.post('/api/sentiment/analyze', (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: 'Texto requerido' });
    }
    
    const { sentimentAnalyzer } = require('./modules/messaging/processors/sentiment.analyzer');
    const result = sentimentAnalyzer.analyze(text);
    
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Error en /api/sentiment/analyze:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/botpress/appointments', async (req, res) => {
  try {
    const { phone, name } = req.query;
    const prisma = new PrismaClient();
    
    const whereClause: any = {};
    if (phone) whereClause.customerPhone = phone as string;
    if (name) whereClause.customerName = { contains: name as string, mode: 'insensitive' };
    
    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: { service: true },
      orderBy: { dateTime: 'desc' },
      take: 10
    });
    
    res.json({ success: true, appointments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/botpress/cancel-appointment', async (req, res) => {
  try {
    const { appointmentId, reason } = req.body;
    const prisma = new PrismaClient();
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { payment: true }
    });
    
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Turno no encontrado' });
    }
    
    const hoursBefore = (new Date(appointment.dateTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursBefore < 2) {
      return res.json({ 
        success: false, 
        error: 'No se puede cancelar con menos de 2 horas de anticipación',
        cancellationAllowed: false
      });
    }
    
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { 
        status: 'CANCELLED',
        cancelledAt: new Date(),
        notes: reason || 'Cancelado por cliente'
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Turno cancelado exitosamente',
      appointment: updated
    });
    
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test-db', async (req, res) => {
  try {
    const prisma = new PrismaClient();
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    res.json({ 
      success: true, 
      message: '✅ Conexión a Supabase exitosa',
      result 
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: '❌ Error de conexión',
      error: error.message 
    });
  }
});

app.get('/api/botpress/professionals', async (req, res) => {
  try {
    const { category } = req.query;
    const prisma = new PrismaClient();
    
    const professionals = await prisma.professional.findMany({
      where: {
        category: category as string,
        isActive: true
      },
      include: {
        professionalServices: {
          include: {
            service: true
          }
        }
      }
    });
    
    res.json({ success: true, professionals });
  } catch (error: any) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de éxito después del pago
app.get('/api/payments/success', (req, res) => {
  res.send(`
    <h1>✅ Pago exitoso!</h1>
    <p>Tu pago ha sido procesado. El turno se ha confirmado.</p>
    <p>Puedes cerrar esta ventana.</p>
  `);
});

// Endpoint de fracaso después del pago
app.get('/api/payments/failure', (req, res) => {
  res.send(`
    <h1>❌ Pago fallido</h1>
    <p>No se pudo procesar el pago. Por favor, intenta de nuevo.</p>
    <p>Puedes cerrar esta ventana.</p>
  `);
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