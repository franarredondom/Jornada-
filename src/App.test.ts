import { describe, expect, it } from 'vitest';
import { asHours, isDate, isTime, weekKey } from './App';

describe('cálculos de jornada', () => {
  it('calcula horas dentro del mismo día', () => {
    expect(asHours('09:00', '18:00')).toBe(9);
    expect(asHours('18:00', '19:30')).toBe(1.5);
  });

  it('calcula correctamente una jornada que cruza medianoche', () => {
    expect(asHours('21:00', '06:00')).toBe(9);
    expect(asHours('23:30', '01:00')).toBe(1.5);
  });

  it('valida horarios y fechas antes de guardarlos', () => {
    expect(isTime('06:30')).toBe(true);
    expect(isTime('25:00')).toBe(false);
    expect(isDate('2026-07-14')).toBe(true);
    expect(isDate('2026-99-14')).toBe(false);
  });

  it('agrupa domingo y lunes según el inicio de semana', () => {
    expect(weekKey('2026-07-13')).toBe('2026-07-13');
    expect(weekKey('2026-07-19')).toBe('2026-07-13');
  });
});
