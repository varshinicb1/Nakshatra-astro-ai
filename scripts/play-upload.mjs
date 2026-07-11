#!/usr/bin/env node
/**
 * play-upload.mjs — upload a signed AAB to a Google Play track via the Play Developer API.
 *
 * Zero dependencies: uses only Node built-ins (crypto, fetch, fs). It mints an OAuth token
 * from the service-account key with the JWT-bearer flow, then calls the Android Publisher
 * REST API directly. (Deliberately avoids the `googleapis` umbrella package — it's a huge,
 * heuristically-"obfuscated" mega-dependency, and all we need here is a few HTTP calls.)
 *
 * Needs a service-account JSON key with "Release manager" access to the app
 * (see the app-factory skill's references/play-publish-api.md).
 *
 * Usage:
 *   node scripts/play-upload.mjs [track] [aab] [keyFile]
 *
 * Defaults:
 *   track   = internal   (internal | alpha | beta | production)
 *   aab     = android/app/build/outputs/bundle/release/app-release.aab
 *   keyFile = $GOOGLE_PLAY_KEY_FILE, else ./play-service-account.json
 *
 * Env overrides:
 *   PLAY_PACKAGE_NAME     package/applicationId (defaults to the constant below)
 *   GOOGLE_PLAY_KEY_FILE  path to the service-account JSON
 *
 * Notes:
 *   - The FIRST bundle for a brand-new app must be uploaded through the Play Console UI once
 *     (to accept the Play App Signing terms). The API handles every release after that.
 *   - versionCode must strictly increase each upload — bump it in android/app/build.gradle
 *     before rebuilding, or the commit will 403/409.
 */
import { createSign } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || 'com.nakshatra.astroai';
const [, , trackArg, aabArg, keyArg] = process.argv;

const track = trackArg || 'internal';
const aabPath = aabArg || 'android/app/build/outputs/bundle/release/app-release.aab';
const keyFile = keyArg || process.env.GOOGLE_PLAY_KEY_FILE || 'play-service-account.json';

const API = 'https://androidpublisher.googleapis.com';

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!['internal', 'alpha', 'beta', 'production'].includes(track))
  fail(`Unknown track "${track}". Use one of: internal, alpha, beta, production.`);
if (!existsSync(aabPath))
  fail(`AAB not found at ${aabPath}. Build it first: npm run android:aab`);
if (!existsSync(keyFile))
  fail(`Service-account key not found at ${keyFile}. Point to it with GOOGLE_PLAY_KEY_FILE or pass it as the 3rd argument.`);

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const jwt = `${unsigned}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function api(token, method, path, { body, raw, contentType } = {}) {
  const res = await fetch(path.startsWith('http') ? path : API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}\n${JSON.stringify(data, null, 2)}`);
  return data;
}

async function main() {
  const sa = JSON.parse(readFileSync(keyFile, 'utf8'));
  console.log(`→ Package: ${PACKAGE_NAME}`);
  console.log(`→ Track:   ${track}`);
  console.log(`→ AAB:     ${aabPath}`);

  const token = await getAccessToken(sa);
  const base = `/androidpublisher/v3/applications/${PACKAGE_NAME}`;

  const edit = await api(token, 'POST', `${base}/edits`);
  const editId = edit.id;

  const bundle = await api(
    token,
    'POST',
    `${API}/upload/androidpublisher/v3/applications/${PACKAGE_NAME}/edits/${editId}/bundles?uploadType=media`,
    { body: readFileSync(aabPath), raw: true, contentType: 'application/octet-stream' },
  );
  const versionCode = bundle.versionCode;
  console.log(`→ Uploaded bundle, versionCode ${versionCode}`);

  await api(token, 'PUT', `${base}/edits/${editId}/tracks/${track}`, {
    body: { releases: [{ versionCodes: [String(versionCode)], status: 'completed' }] },
  });

  await api(token, 'POST', `${base}/edits/${editId}:commit`);
  console.log(`\n✔ Released versionCode ${versionCode} to '${track}'.\n`);
}

main().catch((err) => fail(`Upload failed:\n${err.message || err}`));
