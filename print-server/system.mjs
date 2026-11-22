// Debug readouts and the camera restart for the staff panel's Debug tab. Every command runs
// through execFile with fixed arguments; nothing from a request reaches a command line.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { open } from "node:fs/promises";
import os from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);

const WEBCAM_SERVICE = process.env.WEBCAM_SERVICE?.trim() || "photobooth-webcam.service";
const WEBCAM_DEV = process.env.WEBCAM_DEV?.trim() || "/dev/video42";
const WEBCAM_LOG = process.env.WEBCAM_LOG?.trim() || "/var/log/photobooth-webcam.log";
const SSH_USER = process.env.SSH_USER?.trim() || os.userInfo().username;
/** Lines of the webcam log the Debug tab shows. */
const LOG_LINES = 12;

/** Runs a command and returns its output, or the output it gave before failing. Never throws. */
async function run(bin, args, timeout = 10_000) {
  try {
    const { stdout } = await exec(bin, args, { timeout });
    return { ok: true, out: stdout.trim() };
  } catch (err) {
    return { ok: false, out: String(err?.stdout ?? "").trim(), error: String(err?.stderr || err?.message || err).trim() };
  }
}

/** `systemctl is-active` prints the state and exits non-zero for anything but active. */
async function unitState(unit) {
  const res = await run("systemctl", ["is-active", unit]);
  return res.out.split("\n")[0] || "unknown";
}

/**
 * The booth's addresses, outside loopback, IPv4 first. Link-local IPv6 needs a zone to
 * ssh to, and container bridges can't be reached from another machine, so both are left out.
 */
export function listAddresses(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    if (/^(docker|br-|veth|virbr)/.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      const family = entry.family === 4 || entry.family === "IPv4" ? "IPv4" : "IPv6";
      if (family === "IPv6" && /^fe80:/i.test(entry.address)) continue;
      out.push({ iface: name, family, address: entry.address });
    }
  }
  return out.sort((a, b) => (a.family === b.family ? 0 : a.family === "IPv4" ? -1 : 1));
}

export async function readNetworkInfo() {
  // Debian names the unit ssh; some images call it sshd.
  const [ssh, sshd] = await Promise.all([unitState("ssh"), unitState("sshd")]);
  return {
    hostname: os.hostname(),
    user: SSH_USER,
    addresses: listAddresses(),
    ssh: ssh === "active" || sshd === "active" ? "active" : ssh,
  };
}

/** The SELPHY printers share Canon's vendor ID, so they are left out, as in photobooth-webcam.sh. */
async function canonOnUsb() {
  const res = await run("lsusb", ["-d", "04a9:"]);
  return res.out
    .split("\n")
    .filter(Boolean)
    .some((line) => !/selphy/i.test(line));
}

async function tailLog(file, lines) {
  let handle;
  try {
    handle = await open(file, "r");
    const { size } = await handle.stat();
    const length = Math.min(size, 8192);
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, size - length);
    return buf.toString("utf8").split("\n").filter(Boolean).slice(-lines);
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}

export async function readCameraStatus() {
  const [service, canon, log] = await Promise.all([
    unitState(WEBCAM_SERVICE),
    canonOnUsb(),
    tailLog(WEBCAM_LOG, LOG_LINES),
  ]);
  return { service, canonOnUsb: canon, device: WEBCAM_DEV, deviceExists: existsSync(WEBCAM_DEV), log };
}

/**
 * Stops the webcam feed, resets the Canon's USB link when one is plugged in, and starts the
 * feed again. A fresh start also clears the script's "Canon won't open, use the Pi Camera"
 * fallback. `--no-ask-password` makes a missing polkit rule fail at once instead of hanging.
 */
export async function restartCamera() {
  const steps = [];
  const stop = await run("systemctl", ["--no-ask-password", "stop", WEBCAM_SERVICE], 30_000);
  steps.push({ step: "stop", ok: stop.ok, error: stop.ok ? undefined : stop.error });

  if (await canonOnUsb()) {
    const reset = await run("timeout", ["-k", "5", "20", "gphoto2", "--reset"], 30_000);
    steps.push({ step: "reset-canon", ok: reset.ok, error: reset.ok ? undefined : reset.error });
  }

  const start = await run("systemctl", ["--no-ask-password", "start", WEBCAM_SERVICE], 30_000);
  steps.push({ step: "start", ok: start.ok, error: start.ok ? undefined : start.error });

  const failed = steps.find((s) => !s.ok && s.step !== "reset-canon");
  return {
    ok: !failed,
    message: failed
      ? `Could not ${failed.step} the camera feed: ${failed.error}`
      : "Camera feed restarted. It can take up to 20 seconds to come back.",
    steps,
  };
}
