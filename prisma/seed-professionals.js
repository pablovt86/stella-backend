const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Obtener el tenant existente
  const tenant = await prisma.tenant.findFirst();
  
  if (!tenant) {
    console.log('❌ No hay tenant. Ejecutá el seed principal primero.');
    return;
  }
  
  const professionals = [
    { name: 'Juan', specialty: 'Especialista en cortes', category: 'barberia', tenantId: tenant.id },
    { name: 'Roberto', specialty: 'Especialista en barba', category: 'barberia', tenantId: tenant.id },
    { name: 'Carmen', specialty: 'Colorista', category: 'peluqueria', tenantId: tenant.id },
    { name: 'Noris', specialty: 'Especialista en uñas', category: 'unas', tenantId: tenant.id }
  ];
  
  for (const p of professionals) {
    await prisma.professional.upsert({
      where: { id: `${p.name.toLowerCase()}-${p.category}` },
      update: p,
      create: { id: `${p.name.toLowerCase()}-${p.category}`, ...p }
    });
    console.log(`✅ Profesional agregado: ${p.name} - ${p.category}`);
  }
  
  console.log('✅ Profesionales cargados exitosamente');
}

main()
  .catch(e => console.error('❌ Error:', e))
  .finally(() => prisma.$disconnect());