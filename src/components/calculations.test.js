import { describe, it, expect } from 'vitest';
import {
  calculateBienioPoints,
  getBienioIncrement,
  calculateBienios,
  calculateEffectiveDays,
  getDurationFactor,
  getGradeFactor,
  calculateTrainingPoints,
  getMaxTrainingPoints,
  calculatePostitlePercentage,
  checkPromotion,
  calculateTrainingGap,
  isAnnualClosurePeriod,
} from './calculations';

// ── BIENIOS ────────────────────────────────────────────────────────────────

describe('calculateBienioPoints', () => {
  it('retorna 0 para bieniosCount <= 0', () => {
    expect(calculateBienioPoints('A', 0)).toBe(0);
    expect(calculateBienioPoints('C', -1)).toBe(0);
  });

  it('categoría A — 1er bienio = 1800 pts', () => {
    expect(calculateBienioPoints('A', 1)).toBe(1800);
  });

  it('categoría A — 2do bienio acumula 504 pts adicionales = 2304', () => {
    expect(calculateBienioPoints('A', 2)).toBe(2304);
  });

  it('categoría B — 1er bienio = 576 pts', () => {
    expect(calculateBienioPoints('B', 1)).toBe(576);
  });

  it('categoría B — 2do bienio = 1152 pts', () => {
    expect(calculateBienioPoints('B', 2)).toBe(1152);
  });

  it('categoría C — 1er bienio = 504 pts', () => {
    expect(calculateBienioPoints('C', 1)).toBe(504);
  });

  it('categoría D, E, F usan misma tabla que C', () => {
    expect(calculateBienioPoints('D', 1)).toBe(504);
    expect(calculateBienioPoints('E', 1)).toBe(504);
    expect(calculateBienioPoints('F', 1)).toBe(504);
  });

  it('no supera el bienio 15 (índice máximo de tabla)', () => {
    const pts15 = calculateBienioPoints('A', 15);
    const pts20 = calculateBienioPoints('A', 20);
    expect(pts15).toBe(pts20);
  });
});

describe('getBienioIncrement', () => {
  it('retorna 0 para bienio 0 o negativo', () => {
    expect(getBienioIncrement('A', 0)).toBe(0);
    expect(getBienioIncrement('B', -1)).toBe(0);
  });

  it('categoría A — incremento 1er bienio = 1800', () => {
    expect(getBienioIncrement('A', 1)).toBe(1800);
  });

  it('categoría A — incremento 2do bienio = 504', () => {
    expect(getBienioIncrement('A', 2)).toBe(504);
  });

  it('categoría B — incremento 1er bienio = 576', () => {
    expect(getBienioIncrement('B', 1)).toBe(576);
  });
});

describe('calculateBienios', () => {
  it('0 días = 0 bienios', () => {
    expect(calculateBienios(0)).toBe(0);
  });

  it('729 días = 0 bienios (falta 1 día)', () => {
    expect(calculateBienios(729)).toBe(0);
  });

  it('730 días = 1 bienio exacto', () => {
    expect(calculateBienios(730)).toBe(1);
  });

  it('1460 días = 2 bienios', () => {
    expect(calculateBienios(1460)).toBe(2);
  });

  it('3650 días = 5 bienios', () => {
    expect(calculateBienios(3650)).toBe(5);
  });
});

describe('calculateEffectiveDays', () => {
  it('sin periodos ni licencias = 0', () => {
    expect(calculateEffectiveDays([], 0)).toBe(0);
  });

  it('suma días de periodos y descuenta licencias', () => {
    const periods = [{ days_count: 1000 }, { days_count: 500 }];
    expect(calculateEffectiveDays(periods, 100)).toBe(1400);
  });

  it('no retorna valores negativos', () => {
    const periods = [{ days_count: 10 }];
    expect(calculateEffectiveDays(periods, 9999)).toBe(0);
  });
});

// ── CAPACITACIÓN ───────────────────────────────────────────────────────────

describe('getDurationFactor', () => {
  it('< 16h → 25', () => { expect(getDurationFactor(10)).toBe(25); });
  it('16h → 25', () => { expect(getDurationFactor(16)).toBe(25); });
  it('20h → 35', () => { expect(getDurationFactor(20)).toBe(35); });
  it('40h → 50', () => { expect(getDurationFactor(40)).toBe(50); });
  it('60h → 75', () => { expect(getDurationFactor(60)).toBe(75); });
  it('80h → 100', () => { expect(getDurationFactor(80)).toBe(100); });
  it('100h → 100', () => { expect(getDurationFactor(100)).toBe(100); });
});

describe('getGradeFactor', () => {
  it('nota < 4.0 → 0', () => { expect(getGradeFactor(3.9)).toBe(0); });
  it('nota 4.0 → 0.4', () => { expect(getGradeFactor(4.0)).toBe(0.4); });
  it('nota 5.0 → 0.7', () => { expect(getGradeFactor(5.0)).toBe(0.7); });
  it('nota 6.0 → 1.0', () => { expect(getGradeFactor(6.0)).toBe(1.0); });
  it('nota 7.0 → 1.0', () => { expect(getGradeFactor(7.0)).toBe(1.0); });
});

describe('calculateTrainingPoints', () => {
  it('40h, nota 6.0, nivel Básico → 50 pts', () => {
    expect(calculateTrainingPoints(40, 6.0, 'Básico')).toBe(50);
  });

  it('80h, nota 7.0, nivel Avanzado → 120 pts', () => {
    expect(calculateTrainingPoints(80, 7.0, 'Avanzado')).toBe(120);
  });

  it('nota reprobada (< 4.0) → 0 pts independiente de horas', () => {
    expect(calculateTrainingPoints(80, 3.9, 'Básico')).toBe(0);
  });

  it('nivel técnico desconocido usa factor 1.0', () => {
    expect(calculateTrainingPoints(40, 6.0, 'Desconocido')).toBe(50);
  });
});

describe('getMaxTrainingPoints', () => {
  it('categoría A → 4200', () => { expect(getMaxTrainingPoints('A')).toBe(4200); });
  it('categoría B → 4200', () => { expect(getMaxTrainingPoints('B')).toBe(4200); });
  it('categoría C → 3450', () => { expect(getMaxTrainingPoints('C')).toBe(3450); });
  it('categoría F → 3450', () => { expect(getMaxTrainingPoints('F')).toBe(3450); });
});

// ── POSTÍTULO ──────────────────────────────────────────────────────────────

describe('calculatePostitlePercentage', () => {
  it('categorías C-F → 0% siempre', () => {
    expect(calculatePostitlePercentage('C', 5000)).toBe(0);
    expect(calculatePostitlePercentage('F', 9999)).toBe(0);
  });

  it('Cat A/B, 0 horas → 0%', () => {
    expect(calculatePostitlePercentage('A', 0)).toBe(0);
  });

  it('Cat A/B, 1-1000h → 5%', () => {
    expect(calculatePostitlePercentage('A', 500)).toBe(5);
    expect(calculatePostitlePercentage('B', 1000)).toBe(5);
  });

  it('Cat A/B, 1001-2000h → 10%', () => {
    expect(calculatePostitlePercentage('A', 1500)).toBe(10);
  });

  it('Cat A/B, 2001+h → 15%', () => {
    expect(calculatePostitlePercentage('B', 2001)).toBe(15);
    expect(calculatePostitlePercentage('A', 5000)).toBe(15);
  });
});

// ── ASCENSO ────────────────────────────────────────────────────────────────

describe('checkPromotion', () => {
  it('nivel 1 nunca es elegible (es el máximo)', () => {
    const r = checkPromotion(1, 99999, 'A');
    expect(r.eligible).toBe(false);
  });

  it('cat A/B — nivel 15, sin puntos → no elegible para nivel 14', () => {
    const r = checkPromotion(15, 0, 'A');
    expect(r.eligible).toBe(false);
    expect(r.pointsNeeded).toBeGreaterThan(0);
  });

  it('cat A/B — nivel 15, puntos suficientes (≥737) → elegible para nivel 14', () => {
    const r = checkPromotion(15, 737, 'B');
    expect(r.eligible).toBe(true);
    expect(r.nextLevel).toBe(14);
  });

  it('cat C-F — nivel 15, puntos suficientes (≥689) → elegible para nivel 14', () => {
    const r = checkPromotion(15, 689, 'C');
    expect(r.eligible).toBe(true);
    expect(r.nextLevel).toBe(14);
  });

  it('cat C-F — nivel 15, 688 puntos → no elegible (falta 1 punto)', () => {
    const r = checkPromotion(15, 688, 'D');
    expect(r.eligible).toBe(false);
    expect(r.pointsNeeded).toBe(1);
  });
});

describe('calculateTrainingGap', () => {
  it('nivel 1 → mensaje nivel máximo alcanzado', () => {
    const r = calculateTrainingGap(1, 0, 0, 'C');
    expect(r.gap).toBe(0);
    expect(r.message).toMatch(/máximo/i);
  });

  it('faltan puntos → gap > 0 y mensaje correcto', () => {
    const r = calculateTrainingGap(15, 0, 0, 'C');
    expect(r.gap).toBeGreaterThan(0);
    expect(r.message).toMatch(/faltan/i);
  });

  it('puntos suficientes → gap = 0', () => {
    const r = calculateTrainingGap(15, 689, 0, 'C');
    expect(r.gap).toBe(0);
    expect(r.message).toMatch(/cumple/i);
  });
});

// ── CIERRE ANUAL ───────────────────────────────────────────────────────────

describe('isAnnualClosurePeriod', () => {
  // Usamos objetos Date locales para evitar problemas de zona horaria con strings ISO
  it('julio → no cerrado (antes de agosto 31)', () => {
    expect(isAnnualClosurePeriod(new Date(2026, 6, 15))).toBe(false); // 15 jul 2026
  });

  it('31 de agosto → no cerrado (es el día del cierre, no después)', () => {
    expect(isAnnualClosurePeriod(new Date(2026, 7, 31))).toBe(false); // 31 ago 2026
  });

  it('1 de septiembre → cerrado', () => {
    expect(isAnnualClosurePeriod(new Date(2026, 8, 1))).toBe(true); // 1 sep 2026
  });

  it('diciembre → cerrado', () => {
    expect(isAnnualClosurePeriod(new Date(2026, 11, 15))).toBe(true); // 15 dic 2026
  });
});
