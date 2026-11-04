# Cat Printer (Web Bluetooth)

Two Next.js apps that talk to GB0X / SC03-style Bluetooth thermal printers, reverse‑engineered from `bttrace.pklg - (null).pklg`.

| Folder | Port | Purpose |
|--------|------|---------|
| `web/` | 3000 | Pick printer, upload image, print |
| `photobooth/` | 3001 | Live camera, filters, shutter → print |

## Trace analysis

The capture shows a **Cat Printer** protocol device (`SC03h-4CD0`, firmware `3.0.49`):

| Step | BLE action |
|------|------------|
| Connect | GATT service `0000ae30-…`, write `0000ae01`, notify `0000ae02` |
| Init | `51 78 a8` (device info), `51 78 a3` (state) |
| Configure | `a4` set energy, `a6` apply, `bb` speed, `be`/`bd` lattice |
| Image | `bf` RLE lines and `a2` raw 48-byte rows (384 px wide) |
| Finish | `bd` height, `a1` feed paper, `a3` state |

Frame format: `51 78 CMD 00 LEN_LO LEN_HI PAYLOAD CRC8 FF`

## Run the apps

**Image printer** (`web/`):

```bash
cd web && npm install && npm run dev
```

Open **http://localhost:3000** — choose printer, select image, print.

**Photobooth** (`photobooth/`):

```bash
cd photobooth && npm install && npm run dev
```

Open **http://localhost:3001** — connect printer, pick a **strip surround** (right panel; styles based on common online booth templates), press the shutter **once per photo** (4 total), then the framed vertical strip prints automatically.

Use **Chrome** or **Edge** (HTTPS or localhost). macOS Safari does not support Web Bluetooth for printers.

## Parser scripts (trace)

```bash
python3 parse_trace.py "bttrace.pklg - (null).pklg"
```

## Requirements

- Bluetooth LE thermal printer (GB03, SC03, MX05, Phomemo M02, etc.)
- HTTPS or `localhost` for Web Bluetooth
- User gesture to connect (button click)
