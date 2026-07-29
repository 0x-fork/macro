// Poll the App Store Connect API until an uploaded build finishes processing,
// then make sure its export compliance is resolved so it becomes available in
// TestFlight without any clicking in appstoreconnect.apple.com.
//
// ITSAppUsesNonExemptEncryption + ITSEncryptionExportComplianceCode in
// src-tauri/Info.ios.plist answer the encryption questionnaire during
// processing; if App Store Connect still reports the question as unanswered
// (usesNonExemptEncryption is null, shown as "Missing Compliance" in
// TestFlight), this script fails so the plist regression is caught rather
// than papered over.
//
// Auth (same values as ios-release.sh):
//   APPLE_API_KEY       App Store Connect API Key ID
//   APPLE_API_ISSUER    Issuer ID
//   APPLE_API_KEY_PATH  path to AuthKey_<KEYID>.p8 (defaults to
//                       ~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8)
//
// Usage:
//   bun scripts/ios-app-store-connect-build.mjs --bundle-id com.macro.app.prod \
//     --version 2.0.6 --build 179 [--timeout-minutes 30]

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { exit } from "node:process";

const API_BASE = "https://api.appstoreconnect.apple.com";
const POLL_INTERVAL_MS = 30_000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      console.error(`Malformed arguments near ${JSON.stringify(flag)}`);
      exit(2);
    }
    args[flag.slice(2)] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const bundleId = args["bundle-id"];
const version = args.version;
const build = args.build;
const timeoutMinutes = Number(args["timeout-minutes"] ?? 30);
if (!bundleId || !version || !build) {
  console.error(
    "Required: --bundle-id <id> --version <CFBundleShortVersionString> --build <CFBundleVersion>",
  );
  exit(2);
}

const keyId = process.env.APPLE_API_KEY;
const issuerId = process.env.APPLE_API_ISSUER;
if (!keyId || !issuerId) {
  console.error("APPLE_API_KEY and APPLE_API_ISSUER must be set.");
  exit(2);
}
const keyPath =
  process.env.APPLE_API_KEY_PATH ??
  path.join(os.homedir(), ".appstoreconnect", "private_keys", `AuthKey_${keyId}.p8`);

const privateKey = await importPrivateKey(readFileSync(keyPath, "utf8"));

async function importPrivateKey(pem) {
  const base64 = pem
    .replace(/-----(?:BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

// App Store Connect JWTs must be short-lived (max 20 minutes); mint a fresh
// one per request instead of tracking expiry.
async function makeToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "ES256", kid: keyId, typ: "JWT" };
  const payload = { iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  // WebCrypto ECDSA signatures are already in the raw r||s form JOSE requires.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

async function api(pathname, { method = "GET", body } = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${await makeToken()}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(`${method} ${pathname} → ${response.status}: ${text}`);
    exit(1);
  }
  return response.status === 204 ? null : response.json();
}

const apps = await api(`/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
const app = apps.data[0];
if (!app) {
  console.error(`No App Store Connect app found for bundle id ${bundleId}.`);
  exit(1);
}

const buildsPath =
  `/v1/builds?filter[app]=${app.id}` +
  `&filter[version]=${encodeURIComponent(build)}` +
  `&filter[preReleaseVersion.version]=${encodeURIComponent(version)}` +
  `&sort=-uploadedDate&limit=1`;

const deadline = Date.now() + timeoutMinutes * 60_000;
let buildRecord = null;
while (true) {
  const builds = await api(buildsPath);
  buildRecord = builds.data[0] ?? null;
  const state = buildRecord?.attributes.processingState;
  if (state && state !== "PROCESSING") {
    break;
  }
  if (Date.now() > deadline) {
    console.error(
      `Timed out after ${timeoutMinutes} minutes waiting for build ${version} (${build}) ` +
        `to finish processing. It usually still completes — check TestFlight later:` +
        `\nhttps://appstoreconnect.apple.com/apps/${app.id}/testflight/ios`,
    );
    exit(1);
  }
  console.log(
    buildRecord
      ? `Build ${version} (${build}) is processing…`
      : `Waiting for build ${version} (${build}) to appear in App Store Connect…`,
  );
  await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
}

const state = buildRecord.attributes.processingState;
if (state !== "VALID") {
  console.error(
    `Build ${version} (${build}) finished processing with state ${state}. ` +
      `Check App Store Connect for details:` +
      `\nhttps://appstoreconnect.apple.com/apps/${app.id}/testflight/ios`,
  );
  exit(1);
}
console.log(`Build ${version} (${build}) processed successfully.`);

const compliance = buildRecord.attributes.usesNonExemptEncryption;
if (compliance === null || compliance === undefined) {
  console.error(
    "Export compliance is unanswered — ITSAppUsesNonExemptEncryption did not make " +
      "it into the uploaded binary. The build will show as \"Missing Compliance\" " +
      "in TestFlight until answered manually in App Store Connect:" +
      `\nhttps://appstoreconnect.apple.com/apps/${app.id}/testflight/ios`,
  );
  exit(1);
}
console.log(`Export compliance resolved (usesNonExemptEncryption=${compliance}).`);

console.log(
  `Build is ready for TestFlight: https://appstoreconnect.apple.com/apps/${app.id}/testflight/ios`,
);
