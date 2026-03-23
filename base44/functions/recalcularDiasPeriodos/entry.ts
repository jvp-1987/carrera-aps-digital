import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const BATCH_SIZE = 20;

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const periodos = await base44.asServiceRole.entities.ServicePeriod.list('-created_date', 5000);

  // Filtrar los que necesitan actualización
  const toUpdate = periodos.filter(p => {
    if (!p.start_date || !p.end_date) return false;
    const s = new Date(p.start_date);
    const e = new Date(p.end_date);
    const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return days > 0 && days !== p.days_count;
  }).map(p => {
    const s = new Date(p.start_date);
    const e = new Date(p.end_date);
    const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
    return { id: p.id, days };
  });

  let updated = 0;
  const errors = [];

  // Procesar en lotes paralelos
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(p => base44.asServiceRole.entities.ServicePeriod.update(p.id, { days_count: p.days }))
    );
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') updated++;
      else errors.push({ id: batch[idx].id, error: r.reason?.message });
    });
  }

  return Response.json({ updated, errors, total: periodos.length, skipped: periodos.length - toUpdate.length });
});