import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const mocks = vi.hoisted(() => ({ sockets: [] as any[], auth: vi.fn(), ventas: vi.fn(), cobranza: vi.fn(), rm: vi.fn() }));
vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn(() => {
    const socket = { ev: new EventEmitter(), user: { id: `${mocks.sockets.length ? '573002222222' : '573001111111'}:1@s.whatsapp.net` },
      sendMessage: vi.fn().mockResolvedValue({}), logout: vi.fn(async () => { socket.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 500 } } } }); }), end: vi.fn() };
    mocks.sockets.push(socket); return socket;
  }),
  useMultiFileAuthState: mocks.auth,
  DisconnectReason: { loggedOut: 401, connectionReplaced: 440, badSession: 500, multideviceMismatch: 411 },
  isPnUser: (jid?: string) => jid?.endsWith('@s.whatsapp.net'),
  jidDecode: (jid?: string) => jid ? { user: jid.split('@')[0]?.split(':')[0] } : undefined,
}));
vi.mock('node:fs/promises', () => ({ rm: mocks.rm }));
vi.mock('qrcode', () => ({ default: { toDataURL: async (qr: string) => `data:${qr}` } }));
vi.mock('./procesar-mensaje.js', () => ({ procesarMensajeWhatsApp: mocks.ventas }));
vi.mock('./atencion-ventas.js', () => ({ respuestaVentasPermitida: vi.fn().mockResolvedValue(true) }));
vi.mock('./cobranza-mensajes.js', () => ({ procesarMensajeCobranza: mocks.cobranza }));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
let transporte: typeof import('./baileys-client.js');
beforeEach(async () => {
  vi.resetModules(); mocks.sockets.length = 0;
  mocks.auth.mockReset().mockResolvedValue({ state: {}, saveCreds: vi.fn() });
  mocks.ventas.mockReset().mockResolvedValue('Respuesta ventas');
  mocks.cobranza.mockReset().mockImplementation(async (_entrada, enviar) => enviar('Respuesta cobranza'));
  mocks.rm.mockReset().mockResolvedValue(undefined);
  transporte = await import('./baileys-client.js');
});
afterEach(async () => { await transporte.desconectarWhatsApp('ventas', false); await transporte.desconectarWhatsApp('cobranza', false); vi.useRealTimers(); });
async function conectar() {
  await transporte.conectarWhatsApp(); await transporte.conectarWhatsApp('cobranza');
  for (const socket of mocks.sockets) socket.ev.emit('connection.update', { connection: 'open' });
  await tick();
}
const mensaje = (id = 'm1', jid = '573003333333@s.whatsapp.net') => ({ key: { id, remoteJid: jid }, message: { conversation: 'Hola' } });

it('conserva la ruta de ventas y usa credenciales y QR diferentes para cobranza', async () => {
  await conectar();
  expect(mocks.auth.mock.calls[0][0]).toMatch(/datos[\\/]auth_info_baileys$/);
  expect(mocks.auth.mock.calls[1][0]).toMatch(/datos[\\/]auth_info_baileys_cobranza$/);
  mocks.sockets[1].ev.emit('connection.update', { qr: 'qr-cobranza' }); await tick();
  expect(transporte.obtenerQRCode('cobranza')).toBe('data:qr-cobranza');
  expect(transporte.obtenerQRCode('ventas')).toBeNull();
});
it('cada mensaje entrante pasa al agente y al socket de su numero', async () => {
  await conectar();
  mocks.sockets[0].ev.emit('messages.upsert', { type: 'notify', messages: [mensaje()] });
  mocks.sockets[1].ev.emit('messages.upsert', { type: 'notify', messages: [mensaje()] });
  await tick();
  expect(mocks.ventas).toHaveBeenCalledTimes(1); expect(mocks.cobranza).toHaveBeenCalledTimes(1);
  expect(mocks.sockets[0].sendMessage).toHaveBeenCalledWith('573003333333@s.whatsapp.net', { text: 'Respuesta ventas' });
  expect(mocks.sockets[1].sendMessage).toHaveBeenCalledWith('573003333333@s.whatsapp.net', { text: 'Respuesta cobranza' });
});
it('el envio manual de cobranza nunca usa ventas ni lo usa como alternativa', async () => {
  await conectar();
  await transporte.enviarMensajeWhatsApp('573003333333', 'Cobro', 'cobranza');
  expect(mocks.sockets[0].sendMessage).not.toHaveBeenCalled();
  expect(mocks.sockets[1].sendMessage).toHaveBeenCalledOnce();
  await transporte.desconectarWhatsApp('cobranza');
  await expect(transporte.enviarMensajeWhatsApp('573003333333', 'Cobro', 'cobranza')).rejects.toThrow('cobranza');
  expect(transporte.obtenerEstadoConexion('ventas').conectado).toBe(true);
});
it('filtra grupos, estados, mensajes propios y notificaciones duplicadas', async () => {
  await conectar();
  const mensajes = [mensaje(), mensaje(), mensaje('grupo', 'grupo@g.us'), mensaje('estado', 'status@broadcast'), { ...mensaje('propio'), key: { ...mensaje().key, fromMe: true } }];
  mocks.sockets[1].ev.emit('messages.upsert', { type: 'notify', messages: mensajes }); await tick();
  expect(mocks.cobranza).toHaveBeenCalledTimes(1);
});
it('usa el numero alternativo PN de mensajes LID sin interpretar el LID como telefono', async () => {
  await conectar();
  const msg = mensaje('lid', '12345@lid'); msg.key = { ...msg.key, remoteJidAlt: '573003333333@s.whatsapp.net' } as any;
  mocks.sockets[1].ev.emit('messages.upsert', { type: 'notify', messages: [msg] }); await tick();
  expect(mocks.cobranza.mock.calls[0][0].telefono).toBe('573003333333');
  expect(transporte.extraerNumeroTelefono({ remoteJid: '12345@lid' })).toBeUndefined();
});
it('conectar dos veces no crea dos sockets', async () => {
  await Promise.all([transporte.conectarWhatsApp('cobranza'), transporte.conectarWhatsApp('cobranza')]);
  expect(mocks.sockets).toHaveLength(1);
});
it('desconectar invalida respuestas en curso y no reconecta por el evento de cierre', async () => {
  await conectar();
  let liberar!: () => void;
  mocks.cobranza.mockImplementationOnce(async (_entrada, enviar) => { await new Promise<void>(r => { liberar = r; }); await enviar('Tardia'); });
  mocks.sockets[1].ev.emit('messages.upsert', { type: 'notify', messages: [mensaje()] }); await tick();
  await transporte.desconectarWhatsApp('cobranza'); liberar(); await tick();
  expect(mocks.sockets[1].sendMessage).not.toHaveBeenCalled(); expect(mocks.sockets).toHaveLength(2);
});
it('apagar el servidor conserva la vinculacion y limpiar solo borra la sesion elegida', async () => {
  await conectar();
  await transporte.desconectarWhatsApp('ventas', false);
  expect(mocks.sockets[0].logout).not.toHaveBeenCalled();
  await transporte.limpiarSesionWhatsApp('cobranza');
  expect(mocks.rm).toHaveBeenCalledWith(expect.stringMatching(/auth_info_baileys_cobranza$/), { recursive: true, force: true });
});

it('muestra el bloqueo de red y detiene los reintentos cuando Windows devuelve EACCES', async () => {
  await conectar();
  mocks.sockets[1].ev.emit('connection.update', { connection: 'close', lastDisconnect: {
    error: { message: 'WebSocket Error (connect EACCES 1.2.3.4:443)', data: { code: 'EACCES' }, output: { statusCode: 408 } },
  } });
  await tick();
  expect(transporte.obtenerEstadoConexion('cobranza')).toMatchObject({ conectado: false, conectando: false, qrCode: null, error: expect.stringContaining('no tiene permiso') });
  expect(transporte.obtenerEstadoConexion('ventas').conectado).toBe(true);
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(10000);
  expect(mocks.sockets).toHaveLength(2);
});

it('libera el intento cuando WhatsApp no entrega QR ni abre la conexion', async () => {
  vi.useFakeTimers();
  await transporte.conectarWhatsApp('cobranza');
  expect(transporte.obtenerEstadoConexion('cobranza').conectando).toBe(true);
  await vi.advanceTimersByTimeAsync(45000);
  expect(transporte.obtenerEstadoConexion('cobranza')).toMatchObject({ conectado: false, conectando: false, error: expect.stringContaining('no respondio a tiempo') });
  expect(mocks.sockets[0].end).toHaveBeenCalled();
  await transporte.conectarWhatsApp('cobranza');
  expect(mocks.sockets).toHaveLength(2);
});

it('detiene los reintentos tras tres fallos de conexion consecutivos', async () => {
  vi.useFakeTimers();
  await transporte.conectarWhatsApp('cobranza');
  for (let i = 0; i < 3; i++) {
    mocks.sockets[i].ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { message: 'Connection Failure', output: { statusCode: 408 } } } });
    await vi.advanceTimersByTimeAsync(2500);
  }
  expect(mocks.sockets).toHaveLength(3);
  expect(transporte.obtenerEstadoConexion('cobranza')).toMatchObject({ conectando: false, error: expect.stringContaining('varios intentos') });
});
