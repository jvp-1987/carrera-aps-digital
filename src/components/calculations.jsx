// Tablas de puntaje por bienio según Ley 19.378
const BIENIO_POINTS_TABLE = {
  A: [540, 1080, 1620, 2160, 2700, 3240, 3780, 4320, 4860, 5400, 5940, 6480],
  B: [420, 840, 1260, 1680, 2100, 2520, 2940, 3360, 3780, 4200, 4620, 5040],
  'C-F': [300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700, 3000, 3300, 3600],
};

const MAX_BIENIO_POINTS = 6480;

const TECHNICAL_LEVEL_FACTOR = {
  'Básico': 1.0,
  'Intermedio': 1.2,
  'Avanzado': 1.5,
  'Postgrado': 2.0,
};

function getGradeFactor(grade) {
  if (grade >= 6.5) return 1.5;
  if (grade >= 6.0) return 1.3;
  if (grade >= 5.5) return 1.15;
  if (grade >= 5.0) return 1.0;
  if (grade >= 4.0) return 0.8;
  return 0;
}

export function calculateTrainingPoints(hours, grade, technicalLevel) {
  const gradeFactor = getGradeFactor(grade);
  const levelFactor = TECHNICAL_LEVEL_FACTOR[technicalLevel] || 1.0;
  return Math.round(hours * gradeFactor * levelFactor * 100) / 100;
}

function getBienioCategory(category) {
  if (category === 'A') return 'A';
  if (category === 'B') return 'B';
  return 'C-F';
}

export function calculateBienioPoints(category, bieniosCount) {
  const cat = getBienioCategory(category);
  const table = BIENIO_POINTS_TABLE[cat];
  if (bieniosCount <= 0) return 0;
  const index = Math.min(bieniosCount - 1, table.length - 1);
  return Math.min(table[index], MAX_BIENIO_POINTS);
}

export function calculateBienios(totalDays) {
  return Math.floor(totalDays / 730);
}

export function calculateEffectiveDays(servicePeriods, leaveDays) {
  let totalDays = 0;
  servicePeriods.forEach(period => {
    totalDays += period.days_count || 0;
  });
  return Math.max(0, totalDays - (leaveDays || 0));
}

export function calculateNextBienioDate(hireDate, totalLeaveDays, currentBienios) {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  const daysForNextBienio = (currentBienios + 1) * 730;
  const targetDate = new Date(start);
  targetDate.setDate(targetDate.getDate() + daysForNextBienio + (totalLeaveDays || 0));
  return targetDate.toISOString().split('T')[0];
}

export function calculatePostitlePercentage(category, totalPostitleHours) {
  if (category !== 'A' && category !== 'B') return 0;
  if (totalPostitleHours >= 1000) return 15;
  if (totalPostitleHours >= 500) return 10;
  if (totalPostitleHours >= 250) return 5;
  return 0;
}

const LEVEL_RANGES = {
  15: { min: 0, max: 399 },
  14: { min: 400, max: 799 },
  13: { min: 800, max: 1199 },
  12: { min: 1200, max: 1599 },
  11: { min: 1600, max: 1999 },
  10: { min: 2000, max: 2499 },
  9: { min: 2500, max: 2999 },
  8: { min: 3000, max: 3499 },
  7: { min: 3500, max: 3999 },
  6: { min: 4000, max: 4599 },
  5: { min: 4600, max: 5199 },
  4: { min: 5200, max: 5899 },
  3: { min: 5900, max: 6599 },
  2: { min: 6600, max: 7399 },
  1: { min: 7400, max: 99999 },
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

export function calculateTrainingGap(currentLevel, bienioPoints, trainingPoints) {
  if (currentLevel <= 1) return { gap: 0, message: 'Nivel máximo alcanzado' };
  const nextLevel = currentLevel - 1;
  const range = LEVEL_RANGES[nextLevel];
  if (!range) return { gap: 0, message: 'Sin datos del nivel' };
  const totalPoints = bienioPoints + trainingPoints;
  const gap = Math.max(0, range.min - totalPoints);
  return {
    gap,
    trainingGap: gap,
    nextLevelMin: range.min,
    message: gap > 0 
      ? `Faltan ${gap} puntos para nivel ${nextLevel}` 
      : `Ya cumple puntaje para nivel ${nextLevel}`,
  };
}

export function isAnnualClosurePeriod(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const closureDate = new Date(year, 7, 31);
  return d > closureDate;
}

export { LEVEL_RANGES, BIENIO_POINTS_TABLE, TECHNICAL_LEVEL_FACTOR, MAX_BIENIO_POINTS };