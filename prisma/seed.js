const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Sembrando datos...')
  
  // Primero, crear un Tenant (peluquería)
  const tenant = await prisma.tenant.upsert({
    where: { subdomain: 'mipeluqueria' },
    update: {},
    create: {
      name: 'Mi Peluquería',
      subdomain: 'mipeluqueria',
      email: 'contacto@mipeluqueria.com',
      phone: '123456789',
      status: 'ACTIVE'
    }
  })
  
  console.log(`✅ Tenant creado: ${tenant.name}`)
  
  // Ahora crear los servicios asociados a ese tenant
  const servicios = [
    { id: 'corte-caballero', name: 'Corte Caballero', price: 8000, deposit: 3000, durationMins: 30 },
    { id: 'color-tintura', name: 'Color / Tintura', price: 15000, deposit: 5000, durationMins: 90 },
    { id: 'barba-afeitado', name: 'Barba / Afeitado', price: 4000, deposit: 1500, durationMins: 20 },
    { id: 'corte-barba-premium', name: 'Corte + Barba Premium', price: 11000, deposit: 4000, durationMins: 50 }
  ]

  for (const s of servicios) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        ...s,
        tenantId: tenant.id
      },
      create: {
        ...s,
        tenantId: tenant.id
      }
    })
    console.log(`✅ ${s.name}`)
  }

  console.log('✅ Seed completado')
}

main()
  .catch(e => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())