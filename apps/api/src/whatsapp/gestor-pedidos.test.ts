import { describe, it, expect } from 'vitest';
import { detectarZonaEnMensaje, type ZonaVentaActiva } from './gestor-pedidos.js';

const ZONAS: ZonaVentaActiva[] = [
  { nombre: 'Lejanías', whatsappVendedor: '573001111111' },
  { nombre: 'Granada', whatsappVendedor: '573002222222' },
];

describe('detectarZonaEnMensaje', () => {
  it('encuentra la zona aunque el cliente escriba sin tildes', () => {
    expect(detectarZonaEnMensaje('estoy en lejanias', ZONAS)).toEqual(ZONAS[0]);
  });

  it('encuentra la zona sin importar mayusculas', () => {
    expect(detectarZonaEnMensaje('GRANADA', ZONAS)).toEqual(ZONAS[1]);
  });

  it('encuentra la zona dentro de una frase mas larga', () => {
    expect(detectarZonaEnMensaje('vivo cerca de granada, en la vereda', ZONAS)).toEqual(ZONAS[1]);
  });

  it('retorna null si el mensaje no menciona ninguna zona configurada', () => {
    expect(detectarZonaEnMensaje('estoy en Medellin', ZONAS)).toBeNull();
  });

  it('retorna null si no hay zonas configuradas', () => {
    expect(detectarZonaEnMensaje('lejanias', [])).toBeNull();
  });
});
