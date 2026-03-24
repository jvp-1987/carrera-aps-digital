export function normalizeRUT(rut) {
  return (rut || '')
    .toString()
    .replace(/[.,\s]/g, '')
    .trim()
    .toUpperCase();
}

export function validateRUT(rut) {
  const normalized = normalizeRUT(rut);
  return /^\d{7,8}[0-9K]$/.test(normalized);
}

export function formatRUT(rut) {
  const normalized = normalizeRUT(rut);
  if (normalized.length < 2) return normalized;
  
  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
  
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${verifier}`;
}