/**
 * Phone as a microphone, shared by both booths.
 *
 * The phone opens https://<this PC's LAN IP>:<port>/mic (booth/mic.html). Browsers only
 * give a page the microphone over https, so the booth serves that page with a
 * self-signed certificate made once per machine. The phone and the booth page then
 * exchange WebRTC offers through a tiny WebSocket relay; the audio itself flows
 * phone -> browser directly over the Wi-Fi.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attachWs } from "./ws-text.mjs";

export const lanIps = () => {
  const ips = [];
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const a of rows ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (v4 && !a.internal) ips.push(a.address);
    }
  }
  return ips;
};

/** The booth's https certificate (video/.cache/booth.pfx, passphrase "booth"), rebuilt when the LAN IPs change. */
export const ensureBoothPfx = (root) => {
  if (process.platform !== "win32") return null;
  const dir = path.join(root, ".cache");
  const pfx = path.join(dir, "booth.pfx");
  const meta = path.join(dir, "booth-cert.json");
  const names = ["localhost", os.hostname(), ...lanIps()].filter(Boolean);
  fs.mkdirSync(dir, { recursive: true });
  try {
    const prev = JSON.parse(fs.readFileSync(meta, "utf8"));
    if (fs.existsSync(pfx) && names.every((n) => prev.names?.includes(n))) return pfx;
  } catch {
    /* rebuild */
  }
  const dns = names.map((n) => `'${String(n).replace(/'/g, "")}'`).join(",");
  const ps1 = path.join(dir, "booth-cert.ps1");
  fs.writeFileSync(
    ps1,
    `$ErrorActionPreference = 'Stop'
$names = @(${dns})
$cert = New-SelfSignedCertificate -DnsName $names -NotAfter (Get-Date).AddYears(3) -KeyExportPolicy Exportable -KeySpec KeyExchange -CertStoreLocation 'Cert:\\CurrentUser\\My' -FriendlyName 'Chase recording booth'
$pwd = ConvertTo-SecureString 'booth' -AsPlainText -Force
Export-PfxCertificate -Cert $cert -FilePath '${pfx.replace(/'/g, "''")}' -Password $pwd | Out-Null
Remove-Item -LiteralPath ('Cert:\\CurrentUser\\My\\' + $cert.Thumbprint)
`,
  );
  const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1], { windowsHide: true, encoding: "utf8" });
  if (r.status !== 0 || !fs.existsSync(pfx)) {
    console.log(`  phone mic cert skipped: ${(r.stderr || r.stdout || "powershell failed").trim().slice(-240)}`);
    return null;
  }
  fs.writeFileSync(meta, JSON.stringify({ names }));
  return pfx;
};

/**
 * The signalling relay: one booth page and one phone, each announcing its role, and
 * every other message passed to the other side. Returns an http "upgrade" handler for /ws.
 */
export const createRelay = () => {
  const rooms = { booth: null, phone: null };
  return (req, socket, head) => {
    if (new URL(req.url, "http://booth").pathname !== "/ws") {
      socket.destroy();
      return;
    }
    attachWs(req, socket, head, (msg, send) => {
      if (msg.role === "booth" || msg.role === "phone") {
        rooms[msg.role]?.close();
        rooms[msg.role] = { send, close: () => socket.end() };
        if (msg.role === "phone") send(rooms.booth ? { type: "booth-ready" } : { type: "need-booth" });
        if (msg.role === "booth" && rooms.phone) rooms.phone.send({ type: "booth-ready" });
        return;
      }
      const fromPhone = rooms.phone && rooms.phone.send === send;
      const other = fromPhone ? rooms.booth : rooms.phone;
      if (other) other.send(msg);
      else if (fromPhone) send({ type: "need-booth" });
    });
  };
};
