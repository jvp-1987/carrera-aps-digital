// ============================================================
// Motor de Cálculo - Carrera Funcionaria Ley 19.378
// ============================================================

// ── BIENIOS ─────────────────────────────────────────────────
// Puntaje ACUMULADO por número de bienio según categoría
// Categoría A: 1°=1800, 2°-3°=504/bienio, ..., 11°-15°=216/bienio
// Categoría B: 1°-2°=576/bienio, 3°-4°=504/bienio, ..., 10°-15°=360/bienio
// Categoría C-F: 1°-3°=504/bienio, 4°-12°=432/bienio, 13°-15°=360/bienio

export const MAX_BIENIO_POINTS = 99999;

// Puntaje ACUMULADO por bienio — tabla oficial Ley 19.378
// Fuente: Datos estructurados hoja de cálculo oficial
const BIENIO_POINTS_TABLE = {
  A: [1800, 2304, 2808, 3168, 3528, 3888, 4248, 4608, 4968, 5184, 5400, 5616, 5832, 6048, 6264],
  B: [576, 1152, 1656, 2160, 2592, 3024, 3456, 3888, 4320, 4680, 5040, 5400, 5760, 6120, 6480],
  'C-F': [504, 1008, 1512, 1944, 2376, 2808, 3240, 3672, 4104, 4392, 4680, 4968, 5256, 5544, 5832],
};

function getBienioCategory(category) {
  if (category === 'A') return 'A';
  if (category === 'B') return 'B';
  return 'C-F';
}

// Returns cumulative bienio points for N bienios
export function calculateBienioPoints(category, bieniosCount) {
  if (bieniosCount <= 0) return 0;
  const table = BIENIO_POINTS_TABLE[getBienioCategory(category)];
  const index = Math.min(bieniosCount - 1, table.length - 1);
  return table[index];
}

// Points earned by the Nth bienio (incremental, for display)
export function getBienioIncrement(category, bienioNumber) {
  if (bienioNumber <= 0) return 0;
  const prev = calculateBienioPoints(category, bienioNumber - 1);
  const curr = calculateBienioPoints(category, bienioNumber);
  return curr - prev;
}

// ── EXPERIENCIA ──────────────────────────────────────────────
export function calculateBienios(effectiveDays) {
  return Math.floor(effectiveDays / 730);
}

// Sum all service period days, then subtract leave days
export function calculateEffectiveDays(servicePeriods, leaveDays) {
  const totalWorked = servicePeriods.reduce((s, p) => s + (p.days_count || 0), 0);
  return Math.max(0, totalWorked - (leaveDays || 0));
}

// Next bienio date: computed from actual worked days, displacing by leave days
export function calculateNextBienioDate(servicePeriods, totalLeaveDays, currentBienios) {
  // Sort periods by start date to find the chronological start
  if (!servicePeriods || servicePeriods.length === 0) return null;
  const sorted = [...servicePeriods].sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
  const firstStart = sorted[0].start_date;
  if (!firstStart) return null;

  const start = new Date(firstStart);
  const daysNeeded = (currentBienios + 1) * 730 + (totalLeaveDays || 0);
  const targetDate = new Date(start);
  targetDate.setDate(targetDate.getDate() + daysNeeded);
  return targetDate.toISOString().split('T')[0];
}

// ── CAPACITACIÓN (Art. 10°) ──────────────────────────────────
// Factor Duración
export function getDurationFactor(hours) {
  if (hours >= 80) return 100;
  if (hours >= 60) return 75;
  if (hours >= 40) return 50;
  if (hours >= 20) return 35;
  if (hours >= 16) return 25;
  return 25; // ≤16h
}

// Factor Aprobación
export function getGradeFactor(grade) {
  if (grade >= 6.0) return 1.0;
  if (grade >= 5.0) return 0.7;
  if (grade >= 4.0) return 0.4;
  return 0;
}

// Factor Nivel Técnico
export const TECHNICAL_LEVEL_FACTOR = {
  'Bajo': 1.0,
  'Medio': 1.1,
  'Alto': 1.2,
  // Legacy support
  'Básico': 1.0,
  'Intermedio': 1.1,
  'Avanzado': 1.2,
  'Postgrado': 1.2,
};

// Puntaje final = Factor Duración × Factor Aprobación × Factor Nivel Técnico
export function calculateTrainingPoints(hours, grade, technicalLevel) {
  const durationFactor = getDurationFactor(hours);
  const gradeFactor = getGradeFactor(grade);
  const levelFactor = TECHNICAL_LEVEL_FACTOR[technicalLevel] || 1.0;
  return Math.round(durationFactor * gradeFactor * levelFactor * 100) / 100;
}

// ── TABLA DE CAPACITACIÓN COMPLETA (Art. 10°) ───────────────
// Puntaje máximo acumulado por periodo (1-30), tabla oficial
// Cat. A y B: incremento de 140 pts/periodo
// Cat. C, D, E y F: incremento de 115 pts/periodo
export const MAX_TRAINING_POINTS_AB = 4200;  // 30 × 140
export const MAX_TRAINING_POINTS_CF = 3450;  // 30 × 115

export function getMaxTrainingPoints(category) {
  return (category === 'A' || category === 'B') ? MAX_TRAINING_POINTS_AB : MAX_TRAINING_POINTS_CF;
}

// ── POSTÍTULO (Cat. A y B) ───────────────────────────────────
// Tramos: hasta 1000h → 5%, 1001-2000h → 10%, 2001+h → 15%
export function calculatePostitlePercentage(category, totalPostitleHours) {
  if (category !== 'A' && category !== 'B') return 0;
  if (totalPostitleHours >= 2001) return 15;
  if (totalPostitleHours >= 1001) return 10;
  if (totalPostitleHours >= 1) return 5;
  return 0;
}

export function getNextPostitleThreshold(category, currentHours) {
  if (category !== 'A' && category !== 'B') return null;
  if (currentHours < 1000) return { hours: 1000, percentage: 5 };
  if (currentHours < 2001) return { hours: 2001, percentage: 15 };
  return null;
}

// ── NIVELES Y ASCENSO ────────────────────────────────────────
// Tabla oficial Ley 19.378 — rangos diferenciados por categoría
// Fuente: Datos estructurados hoja de cálculo oficial
export const LEVEL_RANGES_AB = {
  15: { min: 0,    max: 736 },
  14: { min: 737,  max: 1472 },
  13: { min: 1473, max: 2208 },
  12: { min: 2209, max: 2944 },
  11: { min: 2945, max: 3680 },
  10: { min: 3681, max: 4416 },
  9:  { min: 4417, max: 5152 },
  8:  { min: 5153, max: 5888 },
  7:  { min: 5889, max: 6624 },
  6:  { min: 6625, max: 7360 },
  5:  { min: 7361, max: 8096 },
  4:  { min: 8097, max: 8832 },
  3:  { min: 8833, max: 9568 },
  2:  { min: 9569, max: 10304 },
  1:  { min: 10305, max: 99999 },
};

export const LEVEL_RANGES_CF = {
  15: { min: 0,    max: 688 },
  14: { min: 689,  max: 1376 },
  13: { min: 1377, max: 2064 },
  12: { min: 2065, max: 2752 },
  11: { min: 2753, max: 3440 },
  10: { min: 3441, max: 4128 },
  9:  { min: 4129, max: 4816 },
  8:  { min: 4817, max: 5504 },
  7:  { min: 5505, max: 6192 },
  6:  { min: 6193, max: 6880 },
  5:  { min: 6881, max: 7568 },
  4:  { min: 7569, max: 8256 },
  3:  { min: 8257, max: 8944 },
  2:  { min: 8945, max: 9632 },
  1:  { min: 9633, max: 99999 },
};

function getLevelRanges(category) {
  return (category === 'A' || category === 'B') ? LEVEL_RANGES_AB : LEVEL_RANGES_CF;
}

export function checkPromotion(currentLevel, totalPoints, category = 'C') {
  if (currentLevel <= 1) return { eligible: false };
  const ranges = getLevelRanges(category);
  const nextLevel = currentLevel - 1;
  const range = ranges[nextLevel];
  if (!range) return { eligible: false };
  return {
    eligible: totalPoints >= range.min,
    nextLevel,
    pointsNeeded: Math.max(0, range.min - totalPoints),
    currentRange: ranges[currentLevel],
    nextRange: range,
  };
}

// Gap analysis: how many more points needed to reach next level
export function calculateTrainingGap(currentLevel, bienioPoints, trainingPoints, category = 'C') {
  if (currentLevel <= 1) return { gap: 0, trainingGap: 0, message: 'Nivel máximo alcanzado' };
  const ranges = getLevelRanges(category);
  const nextLevel = currentLevel - 1;
  const range = ranges[nextLevel];
  if (!range) return { gap: 0, trainingGap: 0, message: 'Sin datos del nivel' };
  const totalPoints = bienioPoints + trainingPoints;
  const gap = Math.max(0, range.min - totalPoints);
  return {
    gap,
    trainingGap: gap,
    nextLevelMin: range.min,
    nextLevel,
    message: gap > 0
      ? `Faltan ${gap} puntos para nivel ${nextLevel}`
      : `Ya cumple puntaje para nivel ${nextLevel}`,
  };
}

// ── CIERRE ANUAL ─────────────────────────────────────────────
// Periodo cerrado: después del 31 de agosto de cada año
export function isAnnualClosurePeriod(date) {
  const d = date ? new Date(date) : new Date();
  const closureDate = new Date(d.getFullYear(), 7, 31); // Aug 31
  return d > closureDate;
}

export function daysUntilClosure() {
  const today = new Date();
  const closure = new Date(today.getFullYear(), 7, 31);
  if (today > closure) {
    // Already closed; next closure is next year
    return null;
  }
  return Math.ceil((closure - today) / (1000 * 60 * 60 * 24));
}

export { BIENIO_POINTS_TABLE };