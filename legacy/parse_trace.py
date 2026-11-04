#!/usr/bin/env python3
"""Parse Apple PacketLogger (.pklg) Bluetooth trace and extract BLE/ATT activity."""

import struct
import sys
from collections import defaultdict

TYPES = {
    0x00: "HCI_CMD",
    0x01: "HCI_EVT",
    0x02: "ACL_OUT",
    0x03: "ACL_IN",
    0x08: "L2CAP_OUT?",
    0x09: "L2CAP_IN?",
    0xfc: "SYSLOG",
    0xfd: "POWER",
    0xfe: "DIAG",
    0xff: "NOTE",
}

ATT_OPS = {
    0x01: "ERROR_RSP",
    0x02: "EXCH_MTU_REQ",
    0x03: "EXCH_MTU_RSP",
    0x04: "FIND_INFO_REQ",
    0x05: "FIND_INFO_RSP",
    0x06: "FIND_BY_TYPE_REQ",
    0x07: "FIND_BY_TYPE_RSP",
    0x08: "READ_BY_TYPE_REQ",
    0x09: "READ_BY_TYPE_RSP",
    0x0a: "READ_REQ",
    0x0b: "READ_RSP",
    0x0c: "READ_BLOB_REQ",
    0x0d: "READ_BLOB_RSP",
    0x10: "READ_BY_GRP_REQ",
    0x11: "READ_BY_GRP_RSP",
    0x12: "WRITE_REQ",
    0x13: "WRITE_RSP",
    0x16: "PREP_WRITE_REQ",
    0x17: "PREP_WRITE_RSP",
    0x18: "EXEC_WRITE_REQ",
    0x19: "EXEC_WRITE_RSP",
    0x1b: "HANDLE_NTF",
    0x1d: "HANDLE_IND",
    0x1e: "HANDLE_CFM",
    0x52: "WRITE_CMD",
}


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


def parse_acl(payload, direction):
    """Parse ACL packet -> L2CAP -> ATT."""
    if len(payload) < 4:
        return None
    handle_flags = struct.unpack_from("<H", payload, 0)[0]
    handle = handle_flags & 0x0fff
    pb = (handle_flags >> 12) & 0x3
    bc = (handle_flags >> 14) & 0x3
    acl_len = struct.unpack_from("<H", payload, 2)[0]
    acl_data = payload[4:4 + acl_len]
    if len(acl_data) < 4:
        return None
    l2_len = struct.unpack_from("<H", acl_data, 0)[0]
    cid = struct.unpack_from("<H", acl_data, 2)[0]
    l2_payload = acl_data[4:4 + l2_len]
    return {
        "handle": handle,
        "pb": pb,
        "cid": cid,
        "l2_payload": l2_payload,
    }


def fmt_uuid_le(data):
    if len(data) == 2:
        return f"0x{data[1]:02x}{data[0]:02x}"
    if len(data) == 16:
        rev = data[::-1]
        return (rev[0:4].hex() + "-" + rev[4:6].hex() + "-" +
                rev[6:8].hex() + "-" + rev[8:10].hex() + "-" +
                rev[10:16].hex())
    return data.hex()


def parse_att(l2, direction):
    if not l2:
        return None
    op = l2[0]
    name = ATT_OPS.get(op, f"OP_0x{op:02x}")
    out = {"op": op, "name": name, "raw": l2}
    if op in (0x12, 0x52):  # WRITE_REQ / WRITE_CMD
        if len(l2) >= 3:
            handle = struct.unpack_from("<H", l2, 1)[0]
            out["handle"] = handle
            out["value"] = l2[3:]
    elif op == 0x1b:  # HANDLE_NTF
        if len(l2) >= 3:
            handle = struct.unpack_from("<H", l2, 1)[0]
            out["handle"] = handle
            out["value"] = l2[3:]
    elif op == 0x0a:  # READ_REQ
        if len(l2) >= 3:
            out["handle"] = struct.unpack_from("<H", l2, 1)[0]
    elif op == 0x08:  # READ_BY_TYPE_REQ
        if len(l2) >= 7:
            out["start"] = struct.unpack_from("<H", l2, 1)[0]
            out["end"] = struct.unpack_from("<H", l2, 3)[0]
            out["uuid"] = fmt_uuid_le(l2[5:])
    elif op == 0x10:  # READ_BY_GRP_REQ
        if len(l2) >= 7:
            out["start"] = struct.unpack_from("<H", l2, 1)[0]
            out["end"] = struct.unpack_from("<H", l2, 3)[0]
            out["uuid"] = fmt_uuid_le(l2[5:])
    elif op == 0x11:  # READ_BY_GRP_RSP (services)
        if len(l2) >= 2:
            entry_len = l2[1]
            entries = []
            i = 2
            while i + entry_len <= len(l2):
                e = l2[i:i + entry_len]
                start = struct.unpack_from("<H", e, 0)[0]
                end = struct.unpack_from("<H", e, 2)[0]
                uuid = fmt_uuid_le(e[4:])
                entries.append((start, end, uuid))
                i += entry_len
            out["services"] = entries
    elif op == 0x09:  # READ_BY_TYPE_RSP (characteristics)
        if len(l2) >= 2:
            entry_len = l2[1]
            entries = []
            i = 2
            while i + entry_len <= len(l2):
                e = l2[i:i + entry_len]
                handle = struct.unpack_from("<H", e, 0)[0]
                # if this is characteristic definition: properties, value_handle, uuid
                if entry_len in (7, 21):
                    props = e[2]
                    vhandle = struct.unpack_from("<H", e, 3)[0]
                    uuid = fmt_uuid_le(e[5:])
                    entries.append((handle, props, vhandle, uuid))
                else:
                    entries.append((handle, e[2:].hex()))
                i += entry_len
            out["chars"] = entries
    return out


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "bttrace.pklg - (null).pklg"
    with open(path, "rb") as f:
        data = f.read()
    records = parse_records(data)
    print(f"# {len(records)} records")
    type_counts = defaultdict(int)
    for ts, t, p in records:
        type_counts[t] += 1
    print("# Type counts:", {f"0x{k:02x}({TYPES.get(k,'?')})": v for k, v in type_counts.items()})

    services = {}
    chars = {}
    writes_out = []
    writes_in = []
    notifies = []

    for i, (ts, t, p) in enumerate(records):
        if t in (0x02, 0x03):
            direction = "OUT" if t == 0x02 else "IN"
            acl = parse_acl(p, direction)
            if not acl:
                continue
            if acl["cid"] != 0x0004:  # Only ATT
                continue
            att = parse_att(acl["l2_payload"], direction)
            if not att:
                continue
            if att["op"] == 0x11 and "services" in att:
                for s in att["services"]:
                    services[s[0]] = s
            if att["op"] == 0x09 and "chars" in att:
                for c in att["chars"]:
                    if len(c) == 4:
                        chars[c[0]] = c
            if att["op"] in (0x12, 0x52) and direction == "OUT":
                writes_out.append((i, ts, att.get("handle"), att.get("value", b"")))
            if att["op"] == 0x1b and direction == "IN":
                notifies.append((i, ts, att.get("handle"), att.get("value", b"")))

    print("\n## Services discovered:")
    for h, s in sorted(services.items()):
        print(f"  handle 0x{s[0]:04x}-0x{s[1]:04x} uuid={s[2]}")

    print("\n## Characteristics discovered:")
    for h, c in sorted(chars.items()):
        print(f"  decl_handle=0x{c[0]:04x} props=0x{c[1]:02x} value_handle=0x{c[2]:04x} uuid={c[3]}")

    print(f"\n## Writes OUT: {len(writes_out)}")
    for i, ts, h, v in writes_out:
        print(f"  [{i:5d}] t={ts:.3f} handle=0x{h:04x} len={len(v)} {v.hex()}")

    print(f"\n## Notifications IN: {len(notifies)}")
    for i, ts, h, v in notifies[:30]:
        print(f"  [{i:5d}] t={ts:.3f} handle=0x{h:04x} len={len(v)} {v.hex()}")


if __name__ == "__main__":
    main()
