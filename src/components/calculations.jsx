// ============================================================
// Motor de Cálculo - Carrera Funcionaria Ley 19.378
// ============================================================

// ── BIENIOS ─────────────────────────────────────────────────
// Puntaje ACUMULADO por número de bienio según categoría
// Categoría A: 1°=1800, 2°-3°=504/bienio, ..., 11°-15°=216/bienio
// Categoría B: 1°-2°=576/bienio, 3°-4°=504/bienio, ..., 10°-15°=360/bienio
// Categoría C-F: 1°-3°=504/bienio, 4°-12°=432/bienio, 13°-15°=360/bienio

function buildBienioTable(increments) {
  // increments: array of { count, points } — builds cumulative table
  const table = [];
  let cumulative = 0;
  for (const { count, points } of increments) {
    for (let i = 0; i < count; i++) {
      cumulative += points;
      table.push(Math.min(cumulative, MAX_BIENIO_POINTS));
    }
  }
  return table;
}

export const MAX_BIENIO_POINTS = 6480;

// Cumulative points after each bienio (index 0 = after bienio 1)
const BIENIO_POINTS_TABLE = {
  A: buildBienioTable([
    { count: 1, points: 1800 },
    { count: 9, points: 504 },  // bienios 2-10
    { count: 5, points: 216 },  // bienios 11-15
  ]),
  B: buildBienioTable([
    { count: 2, points: 576 },
    { count: 2, points: 504 },
    { count: 5, points: 432 },  // bienios 5-9
    { count: 6, points: 360 },  // bienios 10-15
  ]),
  'C-F': buildBienioTable([
    { count: 3, points: 504 },
    { count: 9, points: 432 },
    { count: 3, points: 360 },
  ]),
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
export const LEVEL_RANGES = {
  15: { min: 0,    max: 399 },
  14: { min: 400,  max: 799 },
  13: { min: 800,  max: 1199 },
  12: { min: 1200, max: 1599 },
  11: { min: 1600, max: 1999 },
  10: { min: 2000, max: 2499 },
  9:  { min: 2500, max: 2999 },
  8:  { min: 3000, max: 3499 },
  7:  { min: 3500, max: 3999 },
  6:  { min: 4000, max: 4599 },
  5:  { min: 4600, max: 5199 },
  4:  { min: 5200, max: 5899 },
  3:  { min: 5900, max: 6599 },
  2:  { min: 6600, max: 7399 },
  1:  { min: 7400, max: 99999 },
};

export function checkPromotion(currentLevel, totalPoints) {
  if (currentLevel <= 1) return { eligible: false };
  const nextLevel = currentLevel - 1;
  const range = LEVEL_RANGES[nextLevel];
  if (!range) return { eligible: false };
  return {
    eligible: totalPoints >= range.min,
    nextLevel,
    pointsNeeded: Math.max(0, range.min - totalPoints),
    currentRange: LEVEL_RANGES[currentLevel],
    nextRange: range,
  };
}

// Gap analysis: how many more training points to reach next level
export function calculateTrainingGap(currentLevel, bienioPoints, trainingPoints) {
  if (currentLevel <= 1) return { gap: 0, trainingGap: 0, message: 'Nivel máximo alcanzado' };
  const nextLevel = currentLevel - 1;
  const range = LEVEL_RANGES[nextLevel];
  if (!range) return { gap: 0, trainingGap: 0, message: 'Sin datos del nivel' };
  const totalPoints = bienioPoints + trainingPoints;
  const gap = Math.max(0, range.min - totalPoints);
  // Training gap = total gap minus what experience alone could still contribute
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