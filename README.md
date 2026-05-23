# Cat Printer (Web Bluetooth)

Next.js app that reproduces the Bluetooth print flow captured in `bttrace.pklg - (null).pklg`.

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

## Run the app

```bash
cd web
npm install
npm run dev
```

Open **http://localhost:3000** in **Chrome** or **Edge** (Web Bluetooth). macOS Safari does not support Web Bluetooth for printers.

1. **Choose printer** — picker filtered to common name prefixes (GB0X, SC03, M02, …).
2. **Select image** — scaled to 384 px width, Floyd–Steinberg dithered to 1-bit.
3. **Print** — sends the same command sequence as the trace.

## Parser scripts (trace)

```bash
python3 parse_trace.py "bttrace.pklg - (null).pklg"
```

## Requirements

- Bluetooth LE thermal printer (GB03, SC03, MX05, Phomemo M02, etc.)
- HTTPS or `localhost` for Web Bluetooth
- User gesture to connect (button click)
