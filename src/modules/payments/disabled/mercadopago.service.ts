// src/modules/payments/services/mercadopago.service.ts
import mercadopago from 'mercadopago';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Configurar MercadoPago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN || '',
});

export class MercadoPagoService {
  
  // Crear preferencia de pago para una seña
  async createDepositPayment(appointmentId: string) {
    try {
      // Obtener la cita
      const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: { service: true, tenant: true }
      });
      
      if (!appointment) {
        throw new Error('Cita no encontrada');
      }
      
      // Crear preferencia de pago
      const preference = {
        items: [
          {
            title: `Seña - ${appointment.service.name}`,
            description: `Turno para ${appointment.customerName} el ${appointment.dateTime}`,
            quantity: 1,
            currency_id: 'ARS',
            unit_price: Number(appointment.depositAmount || appointment.service.deposit),
          }
        ],
        payer: {
          name: appointment.customerName,
          email: appointment.customerEmail || undefined,
          phone: {
            number: appointment.customerPhone,
          }
        },
        back_urls: {
          success: `${process.env.FRONTEND_URL}/payment/success`,
          failure: `${process.env.FRONTEND_URL}/payment/failure`,
          pending: `${process.env.FRONTEND_URL}/payment/pending`,
        },
        auto_return: 'approved',
        external_reference: appointmentId,
        metadata: {
          appointmentId,
          tenantId: appointment.tenantId,
          type: 'DEPOSIT'
        },
        notification_url: `${process.env.MP_WEBHOOK_URL || 'https://tu-webhook.com'}/webhook/mercadopago`,
      };
      
      const response = await mercadopago.preferences.create(preference);
      
      // Guardar referencia del pago
      await prisma.payment.create({
        data: {
          tenantId: appointment.tenantId,
          appointmentId,
          amount: appointment.depositAmount || appointment.service.deposit,
          type: 'DEPOSIT',
          status: 'PENDING',
          provider: 'MERCADOPAGO',
          providerPaymentId: response.body.id!,
          metadata: { preference_id: response.body.id }
        }
      });
      
      return {
        success: true,
        paymentUrl: response.body.init_point,
        preferenceId: response.body.id
      };
      
    } catch (error) {
      console.error('Error al crear pago:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Procesar webhook de MercadoPago
  async handleWebhook(paymentId: string) {
    try {
      // Obtener información del pago
      const payment = await mercadopago.payment.findById(paymentId);
      
      if (!payment || !payment.body) {
        throw new Error('Pago no encontrado');
      }
      
      const paymentData = payment.body;
      
      if (paymentData.status === 'approved') {
        const appointmentId = paymentData.external_reference;
        
        // Actualizar estado de la cita y el pago
        await prisma.$transaction([
          prisma.payment.update({
            where: { providerPaymentId: paymentId },
            data: { status: 'APPROVED' }
          }),
          prisma.appointment.update({
            where: { id: appointmentId },
            data: { 
              depositStatus: 'PAID',
              status: 'CONFIRMED'
            }
          })
        ]);
        
        console.log(`✅ Pago aprobado para cita: ${appointmentId}`);
      }
      
      return { success: true };
      
    } catch (error) {
      console.error('Error en webhook:', error);
      return { success: false, error: error.message };
    }
  }
  
  // Verificar estado de un pago
  async checkPaymentStatus(preferenceId: string) {
    try {
      const payment = await mercadopago.payment.findByPreferenceId(preferenceId);
      return { success: true, status: payment.body.status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}