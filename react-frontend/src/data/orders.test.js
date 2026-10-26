import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOrderStatusLabel,
  getOrderStatusColor,
  getOrderElapsedDays,
  formatElapsedDays,
  getOrderProgress,
  ORDER_STATUS_OPTIONS,
} from './orders';

describe('etiquetas y colores de estado', () => {
  it('traduce los estados conocidos y deja pasar los desconocidos', () => {
    expect(getOrderStatusLabel('pedido_realizado')).toBe('Pedido realizado');
    expect(getOrderStatusLabel('raro')).toBe('raro');
    expect(getOrderStatusColor('cancelado')).toBe('error');
    expect(getOrderStatusColor('raro')).toBe('default');
    expect(ORDER_STATUS_OPTIONS).toHaveLength(6);
  });
});

describe('getOrderElapsedDays', () => {
  afterEach(() => vi.useRealTimers());

  it('cuenta hasta hoy en ordenes abiertas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T12:00:00Z'));
    expect(getOrderElapsedDays({ createdAt: '2026-10-20T12:00:00Z', status: 'pending' })).toBe(6);
  });

  it('se congela en updatedAt en ordenes terminales', () => {
    expect(getOrderElapsedDays({
      createdAt: '2026-10-01T00:00:00Z',
      updatedAt: '2026-10-04T00:00:00Z',
      status: 'finalizado',
    })).toBe(3);
  });

  it('devuelve null sin fecha valida', () => {
    expect(getOrderElapsedDays({})).toBeNull();
    expect(getOrderElapsedDays({ createdAt: 'no-es-fecha' })).toBeNull();
  });

  it('formatea los dias', () => {
    expect(formatElapsedDays(null)).toBe('');
    expect(formatElapsedDays(0)).toBe('hoy');
    expect(formatElapsedDays(1)).toBe('1 día');
    expect(formatElapsedDays(5)).toBe('5 días');
  });
});

describe('getOrderProgress', () => {
  const base = { isInternal: true, status: 'autorizado', totalItems: 4 };

  it('no aplica a externas, terminales, sin items o sin avance', () => {
    expect(getOrderProgress({ ...base, isInternal: false, completedItems: 2 })).toBeNull();
    expect(getOrderProgress({ ...base, status: 'finalizado', completedItems: 2 })).toBeNull();
    expect(getOrderProgress({ ...base, totalItems: 0, completedItems: 0 })).toBeNull();
    expect(getOrderProgress({ ...base, completedItems: 0 })).toBeNull();
  });

  it('distingue parcial de listo', () => {
    expect(getOrderProgress({ ...base, completedItems: 1 })).toEqual({
      kind: 'partial', done: 1, total: 4, label: 'En proceso (1/4)', color: 'info',
    });
    expect(getOrderProgress({ ...base, completedItems: 4 }).label).toBe('Listo (4/4)');
  });
});
