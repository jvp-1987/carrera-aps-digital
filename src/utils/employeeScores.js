import {
  calculateBienioPoints,
  calculateBienios,
  calculateCurrentLevel,
  calculateEffectiveDays,
  calculateNextBienioDate,
  calculatePostitlePercentage,
  calculateTrainingPoints,
  getMaxTrainingPoints,
  parseNumeric,
} from '@/components/calculations';

function round2(value) {
  return Math.round((parseNumeric(value) || 0) * 100) / 100;
}

export function calculateTrainingSummary(employee, trainings = []) {
  const validatedTrainings = trainings.filter((training) => training.status === 'Validado');
  const rawTrainingPoints = round2(validatedTrainings.reduce((sum, training) => (
    sum + calculateTrainingPoints(training.hours, training.grade, training.technical_level)
  ), 0));
  const postitleHours = validatedTrainings.reduce((sum, training) => {
    if (!training.is_postitle) return sum;
    return sum + parseNumeric(training.postitle_hours);
  }, 0);
  const maxTrainingPoints = getMaxTrainingPoints(employee.category, employee.total_experience_days || 0);
  const trainingPoints = Math.min(maxTrainingPoints, rawTrainingPoints);
  const postitlePercentage = calculatePostitlePercentage(employee.category, postitleHours);

  return {
    validatedTrainings,
    rawTrainingPoints,
    maxTrainingPoints,
    trainingPoints,
    postitleHours,
    postitlePercentage,
  };
}

export function calculateCareerSummary(employee, { servicePeriods = [], leaves = [], trainings = [] } = {}) {
  const totalLeaveDays = leaves.reduce((sum, leave) => sum + parseNumeric(leave.days_count), 0);
  const totalExperienceDays = calculateEffectiveDays(servicePeriods, totalLeaveDays);
  const bieniosCount = calculateBienios(totalExperienceDays);
  const bienioPoints = calculateBienioPoints(employee.category, bieniosCount);
  const nextBienioDate = calculateNextBienioDate(servicePeriods, totalLeaveDays, bieniosCount);

  const trainingSummary = calculateTrainingSummary(
    { ...employee, total_experience_days: totalExperienceDays },
    trainings,
  );
  const totalPoints = round2(bienioPoints + trainingSummary.trainingPoints);
  const currentLevel = calculateCurrentLevel(totalPoints, employee.category);

  return {
    total_experience_days: totalExperienceDays,
    total_leave_days: totalLeaveDays,
    bienios_count: bieniosCount,
    bienio_points: bienioPoints,
    next_bienio_date: nextBienioDate,
    training_points: trainingSummary.trainingPoints,
    postitle_percentage: trainingSummary.postitlePercentage,
    total_points: totalPoints,
    current_level: currentLevel,
    training_summary: trainingSummary,
  };
}