export interface CycleStats {
  speed: number;      // km/h
  cadence: number;    // rpm
  power: number;      // watts
  distance: number;   // meters
  heartRate: number;  // bpm
  elapsedTime: number; // seconds
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type BLEGATTServer = {
  connected: boolean;
  connect(): Promise<BLEGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: number): Promise<BLEService>;
};

type BLEService = {
  getCharacteristic(uuid: number): Promise<BLECharacteristic>;
};

type BLECharacteristic = {
  value: DataView | null;
  startNotifications(): Promise<BLECharacteristic>;
  addEventListener(type: string, listener: (event: Event) => void): void;
};

type BLEDevice = {
  gatt?: BLEGATTServer;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
};

const FTMS_SERVICE = 0x1826;
const INDOOR_BIKE_DATA = 0x2ad2;

let currentStats: CycleStats = { speed: 0, cadence: 0, power: 0, distance: 0, heartRate: 0, elapsedTime: 0 };
let currentStatus: ConnectionStatus = 'disconnected';
let bleDevice: BLEDevice | null = null;
let simTimer: number | null = null;
let simStart = 0;

const statsListeners = new Set<(s: CycleStats) => void>();
const statusListeners = new Set<(s: ConnectionStatus) => void>();

function emitStats(stats: CycleStats): void {
  currentStats = stats;
  for (const cb of statsListeners) cb(stats);
}

function emitStatus(status: ConnectionStatus): void {
  currentStatus = status;
  for (const cb of statusListeners) cb(status);
}

export function onStats(cb: (s: CycleStats) => void): () => void {
  statsListeners.add(cb);
  cb(currentStats);
  return () => statsListeners.delete(cb);
}

export function onStatus(cb: (s: ConnectionStatus) => void): () => void {
  statusListeners.add(cb);
  cb(currentStatus);
  return () => statusListeners.delete(cb);
}

export function getStatus(): ConnectionStatus {
  return currentStatus;
}

export function hasBluetooth(): boolean {
  return 'bluetooth' in navigator;
}

function parseIndoorBikeData(data: DataView): void {
  const flags = data.getUint16(0, true);
  let off = 2;
  const s = { ...currentStats };

  // Bit 0 = 0 → instantaneous speed present
  if ((flags & 0x01) === 0) { s.speed = data.getUint16(off, true) / 100; off += 2; }
  if (flags & 0x02) off += 2; // avg speed
  if (flags & 0x04) { s.cadence = data.getUint16(off, true) / 2; off += 2; }
  if (flags & 0x08) off += 2; // avg cadence
  if (flags & 0x10) {
    s.distance = data.getUint8(off) | (data.getUint8(off + 1) << 8) | (data.getUint8(off + 2) << 16);
    off += 3;
  }
  if (flags & 0x20) off += 2; // resistance
  if (flags & 0x40) { s.power = data.getInt16(off, true); off += 2; }
  if (flags & 0x80) off += 2; // avg power
  if (flags & 0x100) off += 5; // expended energy (3 fields)
  if (flags & 0x200) { s.heartRate = data.getUint8(off); off += 1; }
  if (flags & 0x400) off += 1; // metabolic equivalent
  if (flags & 0x800) { s.elapsedTime = data.getUint16(off, true); off += 2; }

  emitStats(s);
}

export async function connectFTMS(): Promise<void> {
  emitStatus('connecting');
  try {
    bleDevice = await (navigator as any).bluetooth.requestDevice({
      filters: [{ services: [FTMS_SERVICE] }],
      optionalServices: [FTMS_SERVICE],
    }) as BLEDevice;

    bleDevice.addEventListener('gattserverdisconnected', () => emitStatus('disconnected'));

    const server = await bleDevice.gatt!.connect();
    const service = await server.getPrimaryService(FTMS_SERVICE);
    const char = await service.getCharacteristic(INDOOR_BIKE_DATA);

    char.addEventListener('characteristicvaluechanged', (e) => {
      const target = e.target as unknown as BLECharacteristic;
      if (target.value) parseIndoorBikeData(target.value);
    });
    await char.startNotifications();
    emitStatus('connected');
  } catch (err) {
    emitStatus('disconnected');
    const name = (err as DOMException)?.name ?? '';
    const msg = (err as Error)?.message ?? '';
    const expected = name === 'NotFoundError' || name === 'NotAllowedError' ||
      name === 'NetworkError' || msg.startsWith('NetworkError');
    if (!expected) console.error('[FTMS]', err);
  }
}

export function disconnectFTMS(): void {
  stopSimulation();
  if (bleDevice?.gatt?.connected) bleDevice.gatt.disconnect();
  emitStatus('disconnected');
}

export function startSimulation(): void {
  stopSimulation();
  simStart = Date.now();
  let t = 0;
  emitStatus('connected');
  simTimer = window.setInterval(() => {
    t += 0.5;
    const cadence = 80 + Math.sin(t / 30) * 25 + (Math.random() - 0.5) * 4;
    emitStats({
      speed: Math.max(0, cadence * 0.38 + (Math.random() - 0.5) * 1.5),
      cadence: Math.max(0, cadence),
      power: Math.max(0, cadence * 2.8 + (Math.random() - 0.5) * 15),
      distance: t * cadence * 0.006,
      heartRate: Math.round(Math.max(60, 128 + cadence * 0.2 + (Math.random() - 0.5) * 4)),
      elapsedTime: Math.floor((Date.now() - simStart) / 1000),
    });
  }, 500);
}

export function stopSimulation(): void {
  if (simTimer !== null) { window.clearInterval(simTimer); simTimer = null; }
}
