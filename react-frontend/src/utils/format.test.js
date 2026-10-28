import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatDateTime } from './format';

// Intl usa espacio duro entre "$" y el número: se normaliza para comparar.
const plain = (s) => s.replace(/\s/g, ' ');

describe('formatCurrency', () => {
  it('formatea en pesos sin decimales', () => {
    expect(plain(formatCurrency(1234567.6))).toBe('$ 1.234.568');
  });
  it('muestra $ 0 para valores vacíos o inválidos', () => {
    for (const v of [null, undefined, '', 'abc', NaN]) {
      expect(plain(formatCurrency(v))).toBe('$ 0');
    }
  });
  it('acepta números como texto (NUMERIC de Postgres)', () => {
    expect(plain(formatCurrency('62000.00'))).toBe('$ 62.000');
  });
});

describe('formatDate', () => {
  it('formatea dd/mm/aaaa', () => {
    expect(formatDate('2026-10-28T12:00:00')).toBe('28/10/2026');
  });
  it('devuelve el fallback sin fecha o con fecha inválida', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(null, '—')).toBe('—');
    expect(formatDate('no-es-fecha', '—')).toBe('—');
  });
});

describe('formatDateTime', () => {
  it('incluye hora y minutos', () => {
    // es-AR con hour "2-digit" da reloj de 12 h ("02:05 p. m."); se acepta
    // también 24 h por si cambian los datos de ICU del entorno.
    expect(plain(formatDateTime('2026-10-28T14:05:00'))).toMatch(
      /^28\/10\/2026,? (14:05|02:05 p\. ?m\.)$/
    );
  });
  it('devuelve null sin fecha o con fecha inválida', () => {
    expect(formatDateTime(null)).toBeNull();
    expect(formatDateTime('x')).toBeNull();
  });
});
