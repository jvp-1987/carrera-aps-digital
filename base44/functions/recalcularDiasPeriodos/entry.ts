import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const periodos = await base44.asServiceRole.entities.ServicePeriod.list('-created_date', 5000);

  let updated = 0;
  const errors = [];

  for (const p of periodos) {
    if (!p.start_date || !p.end_date) continue;
    try {
      const s = new Date(p.start_date);
      const e = new Date(p.end_date);
      const days = Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
      if (days > 0 && days !== p.days_count) {
        await base44.asServiceRole.entities.ServicePeriod.update(p.id, { days_count: days });
        updated++;
      }
    } catch (err) {
      errors.push({ id: p.id, error: err.message });
    }
  }

  return Response.json({ updated, errors, total: periodos.length });
});