import { normalizeRUT, validateRUT, formatRUT } from './rut';

describe('RUT utils', () => {
  it('normalizeRUT elimina puntos y guión y pone mayúsculas', () => {
    expect(normalizeRUT('12.345.678-k')).toBe('12345678K');
  });

  it('validateRUT valida formatos correctos e incorrectos', () => {
    expect(validateRUT('12.345.678-k')).toBe(true);
    expect(validateRUT('12345678')).toBe(false);
    expect(validateRUT('12.345.678-Z')).toBe(false);
  });

  it('formatRUT formatea correctamente', () => {
    expect(formatRUT('12345678k')).toBe('12.345.678-K');
    expect(formatRUT('1')).toBe('1');
  });
});