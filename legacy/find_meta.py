#!/usr/bin/env python3
"""Extract device name and UUIDs from trace."""
import struct
import sys
import re


def parse_records(data):
    off = 0
    records = []
    while off + 13 <= len(data):
        length = struct.unpack_from("<I", data, off)[0]
        ts_s = struct.unpack_from("<I", data, off + 4)[0]
        ts_us = struct.unpack_from("<I", data, off + 8)[0]
        ptype = data[off + 12]
        payload = data[off + 13:off + 4 + length]
        records.append((ts_s + ts_us / 1e6, ptype, payload))
        off += 4 + length
    return records


def hex_dump(b, n=32):
    return b[:n].hex() + (".." if len(b) > n else "")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "bttrace.pklg - (null).pklg"
    with open(path, "rb") as f:
        data = f.read()
    records = parse_records(data)

    print("# SYSLOG entries:")
    for ts, t, p in records:
        if t == 0xfc:
            try:
                print(" ", p.decode("utf-8", errors="replace"))
            except Exception:
                print(" ", p.hex())

    print("\n# Looking for ASCII strings of length >= 4 across all packets:")
    seen = set()
    for ts, t, p in records:
        for m in re.findall(rb"[ -~]{4,}", p):
            s = m.decode("ascii", errors="ignore")
            if s in seen:
                continue
            seen.add(s)
            print(f"  type=0x{t:02x} {s!r}")

    print("\n# HCI commands (first 50):")
    for i, (ts, t, p) in enumerate(records):
        if t == 0x00:
            if len(p) >= 3:
                opcode = struct.unpack_from("<H", p, 0)[0]
                plen = p[2]
                ogf = opcode >> 10
                ocf = opcode & 0x3ff
                print(f"  [{i}] opcode=0x{opcode:04x} ogf=0x{ogf:02x} ocf=0x{ocf:04x} len={plen} data={hex_dump(p[3:])}")

    print("\n# First 30 HCI events:")
    for i, (ts, t, p) in enumerate(records[:200]):
        if t == 0x01:
            if len(p) >= 2:
                ev = p[0]
                plen = p[1]
                if ev == 0x3e:  # LE meta
                    sub = p[2] if len(p) > 2 else 0
                    print(f"  [{i}] LE_META subevent=0x{sub:02x} data={hex_dump(p[2:])}")
                else:
                    print(f"  [{i}] event=0x{ev:02x} len={plen} data={hex_dump(p[2:])}")


if __name__ == "__main__":
    main()
