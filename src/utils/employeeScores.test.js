import { describe, expect, it } from 'vitest';

import { calculateCareerSummary, calculateTrainingSummary } from './employeeScores';

describe('employeeScores', () => {
  it('rebaja capacitación al tope teórico del período cuando el puntaje real lo supera', () => {
    const employee = { category: 'A', total_experience_days: 0, bienio_points: 0 };
    const trainings = [
      { status: 'Validado', hours: 80, grade: 7, technical_level: 'Avanzado', is_postitle: false },
      { status: 'Validado', hours: 80, grade: 7, technical_level: 'Avanzado', is_postitle: false },
    ];

    const summary = calculateTrainingSummary(employee, trainings);

    expect(summary.rawTrainingPoints).toBe(240);
    expect(summary.maxTrainingPoints).toBe(140);
    expect(summary.trainingPoints).toBe(140);
  });

  it('mantiene el puntaje real cuando está bajo el tope teórico del período', () => {
    const employee = { category: 'C', total_experience_days: 0, bienio_points: 0 };
    const trainings = [
      { status: 'Validado', hours: 40, grade: 6, technical_level: 'Básico', is_postitle: false },
    ];

    const summary = calculateTrainingSummary(employee, trainings);

    expect(summary.rawTrainingPoints).toBe(50);
    expect(summary.maxTrainingPoints).toBe(115);
    expect(summary.trainingPoints).toBe(50);
  });

  it('recalcula la carrera completa usando experiencia, licencias y capacitación', () => {
    const employee = { category: 'B' };
    const servicePeriods = [{ days_count: 1440 }];
    const leaves = [{ days_count: 120 }];
    const trainings = [
      { status: 'Validado', hours: 80, grade: 7, technical_level: 'Avanzado', is_postitle: true, postitle_hours: 1200 },
      { status: 'Validado', hours: 40, grade: 6, technical_level: 'Básico', is_postitle: false, postitle_hours: 0 },
    ];

    const summary = calculateCareerSummary(employee, { servicePeriods, leaves, trainings });

    expect(summary.total_experience_days).toBe(1320);
    expect(summary.total_leave_days).toBe(120);
    expect(summary.bienios_count).toBe(1);
    expect(summary.bienio_points).toBe(576);
    expect(summary.training_points).toBe(170);
    expect(summary.postitle_percentage).toBe(10);
    expect(summary.total_points).toBe(746);
    expect(summary.current_level).toBe(14);
  });
});