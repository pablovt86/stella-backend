// actualizar-servicios.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Actualizando servicios...\n');
  
  // Obtener el tenant (la peluquería)
  const tenant = await prisma.tenant.findFirst();
  
  if (!tenant) {
    console.log('❌ No hay tenant. Ejecutá el seed primero.');
    return;
  }
  
  console.log(`📋 Tenant: ${tenant.name}\n`);
  
  // ==================== ACTUALIZAR SERVICIOS EXISTENTES ====================
  const serviciosActuales = [
    { id: 'corte-caballero', name: 'Corte Caballero', price: 8000, deposit: 3000, durationMins: 30, category: 'barberia' },
    { id: 'color-tintura', name: 'Color / Tintura', price: 15000, deposit: 5000, durationMins: 90, category: 'peluqueria' },
    { id: 'barba-afeitado', name: 'Barba / Afeitado', price: 4000, deposit: 1500, durationMins: 20, category: 'barberia' },
    { id: 'corte-barba-premium', name: 'Corte + Barba Premium', price: 11000, deposit: 4000, durationMins: 50, category: 'barberia' }
  ];
  
  console.log('📝 Actualizando servicios existentes...');
  for (const s of serviciosActuales) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        price: s.price,
        deposit: s.deposit,
        durationMins: s.durationMins,
        category: s.category,
        isActive: true,
        tenantId: tenant.id
      },
      create: {
        id: s.id,
        name: s.name,
        price: s.price,
        deposit: s.deposit,
        durationMins: s.durationMins,
        category: s.category,
        isActive: true,
        tenantId: tenant.id
      }
    });
    console.log(`   ✅ ${s.name} → ${s.category}`);
  }
  
  // ==================== AGREGAR NUEVOS SERVICIOS ====================
  const nuevosServicios = [
    // Peluquería (faltantes)
    { id: 'corte-dama', name: 'Corte de Dama', price: 16000, deposit: 5000, durationMins: 40, category: 'peluqueria' },
    { id: 'mechas-balayage', name: 'Mechas Balayage', price: 35000, deposit: 10000, durationMins: 120, category: 'peluqueria' },
    { id: 'tratamiento-capilar', name: 'Tratamiento Capilar', price: 20000, deposit: 6000, durationMins: 60, category: 'peluqueria' },
    { id: 'brushing', name: 'Brushing', price: 10000, deposit: 3000, durationMins: 30, category: 'peluqueria' },
    
    // Uñas
    { id: 'esculpidas', name: 'Esculpidas', price: 25000, deposit: 8000, durationMins: 90, category: 'unas' },
    { id: 'kapping', name: 'Kapping', price: 30000, deposit: 10000, durationMins: 60, category: 'unas' },
    { id: 'semipermanente', name: 'Manicura Semipermanente', price: 20000, deposit: 6000, durationMins: 45, category: 'unas' },
    { id: 'nail-art', name: 'Nail Art', price: 18000, deposit: 5000, durationMins: 60, category: 'unas' },
    
    // Barbería (más servicios)
    { id: 'perfilado-barba', name: 'Perfilado de Barba', price: 8000, deposit: 2500, durationMins: 20, category: 'barberia' },
    { id: 'afeitado-navaja', name: 'Afeitado con Navaja', price: 10000, deposit: 3000, durationMins: 30, category: 'barberia' }
  ];
  
  console.log('\n📝 Agregando nuevos servicios...');
  for (const s of nuevosServicios) {
    await prisma.service.upsert({
      where: { id: s.id },
      update: { ...s, tenantId: tenant.id, isActive: true },
      create: { ...s, tenantId: tenant.id, isActive: true }
    });
    console.log(`   ✅ ${s.name} → ${s.category}`);
  }
  
  // ==================== VERIFICAR RESULTADOS ====================
  console.log('\n📊 Resumen final:');
  const barberia = await prisma.service.count({ where: { category: 'barberia', tenantId: tenant.id } });
  const peluqueria = await prisma.service.count({ where: { category: 'peluqueria', tenantId: tenant.id } });
  const unas = await prisma.service.count({ where: { category: 'unas', tenantId: tenant.id } });
  
  console.log(`   ✂️ Barbería: ${barberia} servicios`);
  console.log(`   💇 Peluquería: ${peluqueria} servicios`);
  console.log(`   💅 Uñas: ${unas} servicios`);
  
  const total = barberia + peluqueria + unas;
  console.log(`\n✅ Total: ${total} servicios disponibles`);
}

main()
  .catch(e => console.error('❌ Error:', e))
  .finally(() => prisma.$disconnect());