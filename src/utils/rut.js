export function normalizeRUT(rut) {
  return (rut || '')
    .toString()
    .replace(/[.\-\s]/g, '')
    .trim()
    .toUpperCase();
}

export function validateRUT(rut) {
  const normalized = normalizeRUT(rut);
  if (!/^\d{7,8}[0-9K]$/.test(normalized)) return false;

  const body = normalized.slice(0, -1);
  const dv = normalized.slice(-1);

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedDV = 11 - (sum % 11);
  const dvChar = expectedDV === 11 ? '0' : expectedDV === 10 ? 'K' : expectedDV.toString();

  return dv === dvChar;
}

export function formatRUT(rut) {
  const normalized = normalizeRUT(rut);
  if (normalized.length < 2) return normalized;
  
  const body = normalized.slice(0, -1);
  const verifier = normalized.slice(-1);
  
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${verifier}`;
}