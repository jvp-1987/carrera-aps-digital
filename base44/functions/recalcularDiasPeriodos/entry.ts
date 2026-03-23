import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const periodos = await base44.asServiceRole.entities.ServicePeriod.list('-created_date', 5000);

  // Filtrar solo los que necesitan actualización
  const toUpdate = periodos.filter(p => {
    if (!p.start_date || !p.end_date) return false;
    const days = Math.floor((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1;
    return days > 0 && days !== p.days_count;
  }).map(p => ({
    id: p.id,
    days: Math.floor((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1,
  }));

  let updated = 0;
  const errors = [];

  // Procesar secuencialmente con pausa para evitar rate limit
  for (const p of toUpdate) {
    try {
      await base44.asServiceRole.entities.ServicePeriod.update(p.id, { days_count: p.days });
      updated++;
      await sleep(100); // 100ms entre cada update para respetar rate limit
    } catch (err) {
      errors.push({ id: p.id, error: err.message });
      if (err.message?.includes('Rate limit')) {
        await sleep(2000); // espera extra si hay rate limit
      }
    }
  }

  return Response.json({ 
    updated, 
    errors: errors.length, 
    total: periodos.length, 
    skipped: periodos.length - toUpdate.length 
  });
});