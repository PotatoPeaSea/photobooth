// Staff Debug tab routes: network info and the camera restart, with fake systemctl, lsusb and
// timeout first on PATH.
import assert from "node:assert/strict";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { listAddresses } from "../system.mjs";
import { startServer } from "./support/server.mjs";

const auth = { "x-staff-pin": "2468" };
const CANON = "Bus 001 Device 005: ID 04a9:3270 Canon, Inc. EOS Rebel SL3\n";

describe("listAddresses", () => {
  it("drops loopback and link-local IPv6 and lists IPv4 first", () => {
    const list = listAddresses({
      lo: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
      docker0: [{ address: "172.17.0.1", family: "IPv4", internal: false }],
      wlan0: [
        { address: "fe80::1", family: "IPv6", internal: false },
        { address: "2001:db8::5", family: "IPv6", internal: false },
        { address: "192.168.1.42", family: "IPv4", internal: false },
      ],
    });
    assert.deepEqual(list, [
      { iface: "wlan0", family: "IPv4", address: "192.168.1.42" },
      { iface: "wlan0", family: "IPv6", address: "2001:db8::5" },
    ]);
  });
});

describe("staff debug routes", () => {
  let server;
  const file = (name) => path.join(server.stateDir, name);
  before(async () => {
    server = await startServer();
  });
  after(async () => {
    await server?.stop();
  });
  beforeEach(async () => {
    await server.reset();
    for (const name of ["lsusb", "systemctl_fail", "systemctl_state_ssh", "systemctl_state_photobooth-webcam.service"]) {
      await rm(file(name), { force: true });
    }
  });

  it("needs the PIN and runs nothing without it", async () => {
    assert.equal((await server.get("/staff/debug")).status, 401);
    assert.equal((await server.post("/staff/camera/restart")).status, 401);
    assert.equal((await server.calls("systemctl")).length, 0);
  });

  it("reports hostname, addresses, ssh, Wi-Fi and the camera feed", async () => {
    await writeFile(file("systemctl_state_photobooth-webcam.service"), "failed\n");
    await writeFile(file("lsusb"), CANON);
    const res = await server.get("/staff/debug", auth);
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.network.hostname, "string");
    assert.ok(Array.isArray(res.body.network.addresses));
    assert.equal(res.body.network.ssh, "active");
    assert.equal(res.body.network.wifi, "HomeNet");
    assert.equal(res.body.camera.service, "failed");
    assert.equal(res.body.camera.canonOnUsb, true);
  });

  it("restarts the feed without a Canon reset when only the printer is on USB", async () => {
    const res = await server.post("/staff/camera/restart", {}, auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.deepEqual(await server.calls("systemctl"), [
      ["--no-ask-password", "stop", "photobooth-webcam.service"],
      ["--no-ask-password", "start", "photobooth-webcam.service"],
    ]);
    assert.equal((await server.calls("timeout")).length, 0);
  });

  it("resets the Canon between stop and start when it is on USB", async () => {
    await writeFile(file("lsusb"), CANON);
    const res = await server.post("/staff/camera/restart", {}, auth);
    assert.equal(res.body.ok, true);
    assert.deepEqual(await server.calls("timeout"), [["-k", "5", "20", "gphoto2", "--reset"]]);
  });

  it("says what failed when systemctl is refused", async () => {
    await writeFile(file("systemctl_fail"), "start\n");
    const res = await server.post("/staff/camera/restart", {}, auth);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, false);
    assert.match(res.body.message, /Could not start the camera feed: .*Access denied/);
  });
});
