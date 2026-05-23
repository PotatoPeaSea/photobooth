#!/usr/bin/env python3
"""Dump all packets with type-aware decoding."""
import struct
import sys
from collections import Counter


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


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "bttrace.pklg - (null).pklg"
    with open(path, "rb") as f:
        data = f.read()
    records = parse_records(data)
    print(f"Total {len(records)}")

    sub_counts = Counter()
    for ts, t, p in records:
        if t == 0x01 and len(p) >= 2:
            ev = p[0]
            if ev == 0x3e and len(p) > 2:
                sub_counts[("LE", p[2])] += 1
            else:
                sub_counts[("EVT", ev)] += 1
    print("Event subevent counts:")
    for k, v in sub_counts.most_common():
        print(f"  {k}: {v}")

    print("\nFirst 80 ACL_IN packets:")
    n = 0
    for i, (ts, t, p) in enumerate(records):
        if t == 0x03:
            print(f"  [{i}] {p.hex()}")
            n += 1
            if n >= 80:
                break

    print("\nFirst 5 ACL_OUT packets:")
    n = 0
    for i, (ts, t, p) in enumerate(records):
        if t == 0x02:
            print(f"  [{i}] {p.hex()}")
            n += 1
            if n >= 5:
                break

    # Look for LE create connection / extended create connection commands for peer address
    print("\nHCI commands with peer address (LE create conn):")
    for i, (ts, t, p) in enumerate(records):
        if t == 0x00 and len(p) >= 3:
            opcode = struct.unpack_from("<H", p, 0)[0]
            # 0x200d = LE Create Connection, 0x2043 = LE Extended Create Connection
            if opcode in (0x200d, 0x2043, 0x2042):
                print(f"  [{i}] opcode=0x{opcode:04x} data={p.hex()}")


if __name__ == "__main__":
    main()
