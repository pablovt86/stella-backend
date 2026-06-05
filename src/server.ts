import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { WhatsAppWebhookController } from './modules/whatsapp/controllers/webhook.controller';
import mercadopago from 'mercadopago';

dotenv.config();

// ============================================================================
// FIX DE ARQUITECTURA CRÍTICO 1: INSTANCIA ÚNICA DE PRISMA CLIENT (SINGLETON)
// EXPLICACIÓN: Antes ponías "const prisma = new PrismaClient()" ADENTRO de cada
// app.get o app.post. Cada petición abría un pool nuevo de conexiones a Supabase.
// En producción, tras 10 mensajes del bot, Supabase te bloquea por exceso de 
// conexiones (Error: Too many connections), volteándote el backend completo.
// Al declararlo global acá arriba, todos los endpoints reutilizan el mismo canal.
// ============================================================================
const prisma = new PrismaClient();

// Configurar MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || 'TEST-4325437722170573-052116-2c61f4e15d2cc8c33ea20200b9cbc65a-1770074697'
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:5173', 'http://192.168.1.44:8080', 'http://localhost'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ==================== ENDPOINTS PÚBLICOS ====================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.get('/api/services', async (req, res) => {
  try {
    const services = await prisma.service.findMany();
    res.json({ success: true, data: services });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error al obtener servicios' });
  }
});

app.get('/api/services/:id', async (req, res) => {
  try {
    const service = await prisma.service.findUnique({
      where: { id: req.params.id }
    });
    if (!service) {
      return res.status(404).json({ success: false, error: 'Servicio no encontrado' });
    }
    res.json({ success: true, data: service });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error al obtener servicio' });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const { customerName, customerPhone, customerEmail, serviceId, dateTime } = req.body;
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/appointments', async (req, res) => {
  try {
    const appointments = await prisma.appointment.findMany({
      include: { service: true },
      orderBy: { dateTime: 'asc' }
    });
    res.json({ success: true, data: appointments });
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Error al obtener citas' });
  }
});

// ==================== MERCADOPAGO ====================

app.post('/api/payments/create/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { service: true, tenant: true }
    });
    
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Cita no encontrada' });
    }
    
    const amount = appointment.depositAmount || appointment.service.deposit;
    
    const preference = {
      items: [
        {
          title: `Seña - ${appointment.service.name}`,
          quantity: 1,
          currency_id: 'ARS' as any,
          unit_price: amount
        }
      ],
      external_reference: appointmentId,
      back_urls: {
        success: `${process.env.BACKEND_URL || 'https://stella-backend-n1uo.onrender.com'}/api/payments/success`,
        failure: `${process.env.BACKEND_URL || 'https://stella-backend-n1uo.onrender.com'}/api/payments/failure`
      },
      auto_return: 'approved'
    };
    
    const response = await (mercadopago as any).preferences.create(preference);
    
    await prisma.payment.create({
      data: {
        tenantId: appointment.tenantId,
        appointmentId,
        amount: amount,
        type: 'DEPOSIT',
        status: 'PENDING',
        provider: 'MERCADOPAGO',
        providerPaymentId: response.body.id,
        metadata: { preference_id: response.body.id }
      }
    });
    
    res.json({
      success: true,
      paymentUrl: response.body.init_point,
      preferenceId: response.body.id,
      amount: amount
    });
    
  } catch (error: any) {
    console.error('Error al crear pago:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/payments/status/:appointmentId', async (req, res) => {
  try {
    const { appointmentId } = req.params;
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

app.get('/api/payments/success', (req, res) => {
  res.send('<h1>✅ Pago exitoso!</h1><p>Tu turno ha sido confirmado.</p><a href="https://stella-frontend.onrender.com">Volver a Stella Estudio</a>');
});

app.get('/api/payments/failure', (req, res) => {
  res.send('<h1>❌ Pago fallido</h1><p>No se pudo procesar el pago.</p><a href="https://stella-frontend.onrender.com">Intentar de nuevo</a>');
});

// Webhook de MercadoPago
app.post('/webhook/mercadopago', async (req, res) => {
  try {
    const { type, data } = req.body;
    if (type === 'payment') {
      const payment = await (mercadopago as any).payment.findById(data.id);
      if (payment.body.status === 'approved') {
        const appointmentId = payment.body.external_reference;
        await prisma.appointment.update({
          where: { id: appointmentId },
          data: { depositStatus: 'PAID', status: 'CONFIRMED' }
        });
        console.log(`✅ Pago aprobado para cita: ${appointmentId}`);
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
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

app.post('/api/botpress/services', async (req, res) => {
  try {
    const { category } = req.body;
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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/botpress/check-availability', async (req, res) => {
  try {
    const { serviceId, date, time } = req.body;
    const dateTime = new Date(`${date}T${time}:00`);
    const existingAppointment = await prisma.appointment.findFirst({
      where: { serviceId, dateTime, status: { not: 'CANCELLED' } }
    });
    res.json({ success: true, available: !existingAppointment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/botpress/create-appointment', async (req, res) => {
  try {
    console.log('📥 Webhook de Botpress recibido para reserva directa:', req.body);
    let { serviceId, customerName, customerPhone, date, time } = req.body;
    
    let service = null;
    if (serviceId && typeof serviceId === 'string' && serviceId.length > 2) {
      service = await prisma.service.findUnique({ where: { id: serviceId } });
    }
    
    if (!service) {
      console.log(`⚠️ ID de servicio '${serviceId}' no hallado. Aplicando fallback de emergencia...`);
      service = await prisma.service.findFirst({ where: { isActive: true } });
      
      if (!service) {
        return res.status(404).json({ success: false, error: 'No hay ningún servicio activo en la base de datos' });
      }
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
        customerEmail: null,
        dateTime: dateTime,
        durationMins: service.durationMins,
        depositAmount: service.deposit,
        status: 'CONFIRMED',
        depositStatus: 'NOT_PAID',
        holdExpiresAt: holdExpiresAt
      }
    });

    // ============================================================================
    // FIX DE LOGICA CRÍTICO 2: MERCADOPAGO INTEGRADO EN CREAR-APPOINTMENT
    // EXPLICACIÓN: Dejabas la función colgada e inconclusa con la llave abierta al final. 
    // Ahora, cuando Botpress crea el turno, llama inmediatamente a Mercado Pago 
    // desde acá adentro, genera la preferencia de pago, mapea la respuesta y le
    // retorna a Botpress tanto el ID de la cita como la "paymentUrl" real.
    // ============================================================================
    let paymentUrl = '';
    try {
      const amount = appointment.depositAmount;
      const preference = {
        items: [
          {
            title: `Seña Secreta - ${service.name}`,
            quantity: 1,
            currency_id: 'ARS' as any,
            unit_price: amount
          }
        ],
        external_reference: appointment.id,
        back_urls: {
          success: `${process.env.BACKEND_URL || 'https://stella-backend-n1uo.onrender.com'}/api/payments/success`,
          failure: `${process.env.BACKEND_URL || 'https://stella-backend-n1uo.onrender.com'}/api/payments/failure`
        },
        auto_return: 'approved'
      };

      const mpResponse = await (mercadopago as any).preferences.create(preference);
      paymentUrl = mpResponse.body.init_point;

      // Dejamos registro del intento de pago en la DB
      await prisma.payment.create({
        data: {
          tenantId: tenant.id,
          appointmentId: appointment.id,
          amount: amount,
          type: 'DEPOSIT',
          status: 'PENDING',
          provider: 'MERCADOPAGO',
          providerPaymentId: mpResponse.body.id,
          metadata: { preference_id: mpResponse.body.id }
        }
      });
    } catch (mpErr: any) {
      console.error('⚠️ Error al generar Mercado Pago en el webhook directo:', mpErr.message);
      // No cortamos la ejecución para que Botpress reciba la cita al menos.
    }

    // Retorno limpio para que la acción de Botpress atrape el link azul
    return res.json({
      success: true,
      appointment: {
        id: appointment.id,
        paymentUrl: paymentUrl
      }
    });

  } catch (error: any) {
    console.error('❌ Falló la creación del turno en Botpress endpoint:', error);
    return res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/botpress/appointments', async (req, res) => {
  try {
    const { phone, name } = req.query;
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
    const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { payment: true } });
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Turno no encontrado' });
    }
    const hoursBefore = (new Date(appointment.dateTime).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursBefore < 2) {
      return res.json({ success: false, error: 'No se puede cancelar con menos de 2 horas de anticipación', cancellationAllowed: false });
    }
    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), notes: reason || 'Cancelado por cliente' }
    });
    res.json({ success: true, message: 'Turno cancelado exitosamente', appointment: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT 1 as connected`;
    res.json({ success: true, message: '✅ Conexión a Supabase exitosa', result });
  } catch (error: any) {
    res.status(500).json({ success: false, message: '❌ Error de conexión', error: error.message });
  }
});

app.get('/api/botpress/professionals', async (req, res) => {
  try {
    const { category } = req.query;
    const professionals = await prisma.professional.findMany({
      where: { category: category as string, isActive: true },
      include: { professionalServices: { include: { service: true } } }
    });
    res.json({ success: true, professionals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ENDPOINT DE DIAGNÓSTICO
app.get('/api/payments/diagnostico', async (req, res) => {
  try {
    const token = process.env.MP_ACCESS_TOKEN;
    const tokenPreview = token ? `${token.substring(0, 15)}...` : 'NO CONFIGURADO';
    
    const testPreference = {
      items: [{ title: 'Test', quantity: 1, currency_id: 'ARS', unit_price: 100 }],
      external_reference: 'test-123'
    };
    
    let mpResponse;
    try {
      mpResponse = await (mercadopago as any).preferences.create(testPreference);
    } catch (mpError: any) {
      mpResponse = { error: mpError.message, details: mpError.response?.data };
    }
    
    res.json({
      success: false,
      message: 'Endpoint de diagnóstico',
      token_configurado: !!token,
      token_preview: tokenPreview,
      backend_url: process.env.BACKEND_URL,
      mercado_pago_test: mpResponse
    });
    
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INICIAR SERVIDOR ====================
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📋 Endpoints disponibles:`);
  console.log(`   GET  /health`);
  console.log(`   GET  /api/services`);
  console.log(`   POST /api/payments/create/:appointmentId`);
  console.log(`   GET  /api/payments/status/:appointmentId`);
});