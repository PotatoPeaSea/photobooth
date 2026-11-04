#!/usr/bin/env python3
"""Find advertising data / device name in trace."""
import struct
import sys


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


def parse_ad(data):
    out = []
    i = 0
    while i < len(data):
        ln = data[i]
        if ln == 0 or i + 1 + ln > len(data):
            break
        atype = data[i + 1]
        val = data[i + 2:i + 1 + ln]
        out.append((atype, val))
        i += 1 + ln
    return out


def fmt_uuid_le(data):
    if len(data) == 2:
        return f"0x{data[1]:02x}{data[0]:02x}"
    if len(data) == 4:
        return f"0x{data[3]:02x}{data[2]:02x}{data[1]:02x}{data[0]:02x}"
    if len(data) == 16:
        rev = data[::-1]
        return (rev[0:4].hex() + "-" + rev[4:6].hex() + "-" +
                rev[6:8].hex() + "-" + rev[8:10].hex() + "-" +
                rev[10:16].hex())
    return data.hex()


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "bttrace.pklg - (null).pklg"
    with open(path, "rb") as f:
        data = f.read()
    records = parse_records(data)

    for i, (ts, t, p) in enumerate(records):
        if t != 0x01:
            continue
        if len(p) < 2:
            continue
        ev = p[0]
        if ev != 0x3e:
            continue
        sub = p[2]
        # 0x02 = LE Advertising Report
        # 0x0d = LE Extended Advertising Report
        if sub == 0x02 and len(p) > 4:
            num = p[3]
            o = 4
            for _ in range(num):
                if o + 9 > len(p):
                    break
                etype = p[o]
                atype = p[o + 1]
                addr = p[o + 2:o + 8][::-1]
                ad_len = p[o + 8]
                ad_data = p[o + 9:o + 9 + ad_len]
                rssi = struct.unpack_from("b", p, o + 9 + ad_len)[0] if o + 9 + ad_len < len(p) else 0
                addr_s = ":".join(f"{b:02x}" for b in addr)
                print(f"[{i}] LE_ADV etype={etype} addr={addr_s} rssi={rssi} ad_len={ad_len}")
                for tag, val in parse_ad(ad_data):
                    if tag == 0x09 or tag == 0x08:
                        print(f"  NAME(0x{tag:02x}): {val.decode('utf-8', errors='replace')}")
                    elif tag in (0x02, 0x03):
                        print(f"  UUID16(0x{tag:02x}): {fmt_uuid_le(val)}")
                    elif tag in (0x06, 0x07):
                        print(f"  UUID128(0x{tag:02x}): {fmt_uuid_le(val)}")
                    elif tag == 0x16 or tag == 0x20 or tag == 0x21:
                        print(f"  SERVICE_DATA(0x{tag:02x}): {val.hex()}")
                    elif tag == 0xff:
                        print(f"  MFG_DATA: {val.hex()}")
                    else:
                        print(f"  AD type=0x{tag:02x} val={val.hex()}")
                o += 9 + ad_len + 1


if __name__ == "__main__":
    main()
