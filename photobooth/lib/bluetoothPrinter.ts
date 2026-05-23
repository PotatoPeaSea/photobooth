import {
  buildFrame,
  buildInitSequence,
  buildPrintJob,
  Cmd,
  PRINTER_NAME_PREFIXES,
  PRINTER_RX_CHARACTERISTICS,
  PRINTER_SERVICES,
  PRINTER_TX_CHARACTERISTICS,
  type PrintOptions,
} from "./catPrinter";

const CHUNK_DELAY_MS = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pickService(services: BluetoothRemoteGATTService[]) {
  for (const uuid of PRINTER_SERVICES) {
    const s = services.find(
      (x) => x.uuid.toLowerCase() === uuid.toLowerCase()
    );
    if (s) return s;
  }
  return services[0] ?? null;
}

async function getChar(
  service: BluetoothRemoteGATTService,
  uuids: readonly string[]
): Promise<BluetoothRemoteGATTCharacteristic | null> {
  for (const uuid of uuids) {
    try {
      return await service.getCharacteristic(uuid);
    } catch {
      /* try next */
    }
  }
  const all = await service.getCharacteristics();
  return all[0] ?? null;
}

export type ProgressCallback = (msg: string, pct: number) => void;

export class BluetoothCatPrinter {
  private device: BluetoothDevice | null = null;
  private tx: BluetoothRemoteGATTCharacteristic | null = null;
  private rx: BluetoothRemoteGATTCharacteristic | null = null;

  get connected(): boolean {
    return !!this.device?.gatt?.connected;
  }

  get deviceName(): string {
    return this.device?.name ?? "Unknown";
  }

  static isSupported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.bluetooth;
  }

  async connect(onNotify?: (data: DataView) => void): Promise<string> {
    if (!BluetoothCatPrinter.isSupported()) {
      throw new Error(
        "Web Bluetooth is not available. Use Chrome or Edge over HTTPS or localhost."
      );
    }

    const filters = PRINTER_NAME_PREFIXES.map((namePrefix) => ({
      namePrefix,
    }));

    const device = await navigator.bluetooth.requestDevice({
      filters,
      optionalServices: [...PRINTER_SERVICES],
    });

    this.device = device;
    device.addEventListener("gattserverdisconnected", () => {
      this.tx = null;
      this.rx = null;
    });

    const server = await device.gatt?.connect();
    if (!server) throw new Error("GATT server unavailable");

    const services = await server.getPrimaryServices();
    const service = pickService(services);
    if (!service) throw new Error("Printer GATT service not found");

    const tx = await getChar(service, PRINTER_TX_CHARACTERISTICS);
    const rx = await getChar(service, PRINTER_RX_CHARACTERISTICS);
    if (!tx) throw new Error("TX characteristic not found");

    this.tx = tx;
    this.rx = rx;

    if (rx) {
      try {
        await rx.startNotifications();
        rx.addEventListener("characteristicvaluechanged", (ev) => {
          const target = ev.target as BluetoothRemoteGATTCharacteristic;
          if (target.value && onNotify) onNotify(target.value);
        });
      } catch {
        /* notifications optional */
      }
    }

    return device.name ?? "Printer";
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.device = null;
    this.tx = null;
    this.rx = null;
  }

  private async writeFrame(frame: Uint8Array): Promise<void> {
    if (!this.tx) throw new Error("Not connected");
    await this.tx.writeValueWithoutResponse(new Uint8Array(frame));
    await sleep(CHUNK_DELAY_MS);
  }

  async sendInit(): Promise<void> {
    for (const frame of buildInitSequence()) {
      await this.writeFrame(frame);
    }
  }

  async printRows(
    rows: Uint8Array[],
    opts?: PrintOptions,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const frames = buildPrintJob(rows, opts);
    const total = frames.length;
    for (let i = 0; i < total; i++) {
      await this.writeFrame(frames[i]!);
      if (onProgress) {
        onProgress(`Sending line ${i + 1} / ${total}`, (100 * (i + 1)) / total);
      }
    }
  }
}
