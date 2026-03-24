export const categoryLabels = {
  A: 'Médicos',
  B: 'Profesionales',
  C: 'Técnicos',
  D: 'Técnicos Salud',
  E: 'Administrativos',
  F: 'Auxiliares',
};

export const categoryColors = {
  A: 'bg-violet-100 text-violet-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-teal-100 text-teal-700',
  D: 'bg-cyan-100 text-cyan-700',
  E: 'bg-orange-100 text-orange-700',
  F: 'bg-slate-100 text-slate-700',
};

export function normalizeRUT(rut) {
  return (rut || '')
    .toString()
    .replace(/\./g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim()
    .toUpperCase();
}