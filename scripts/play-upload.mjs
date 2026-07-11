#!/usr/bin/env node
/**
 * play-upload.mjs — upload a signed AAB to a Google Play track via the Play Developer API.
 *
 * One-command releases, no dashboard drag-and-drop. Needs a service-account JSON key with
 * "Release manager" access to the app (see references/play-publish-api.md in the app-factory skill).
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
 *   PLAY_PACKAGE_NAME   package/applicationId (defaults to the constant below)
 *   GOOGLE_PLAY_KEY_FILE  path to the service-account JSON
 *
 * Notes:
 *   - The FIRST bundle for a brand-new app must be uploaded through the Play Console UI once
 *     (to accept the Play App Signing terms). The API handles every release after that.
 *   - versionCode must strictly increase each upload — bump it in android/app/build.gradle
 *     before rebuilding, or this will 409.
 */
import { google } from 'googleapis';
import { readFileSync, existsSync } from 'node:fs';

const PACKAGE_NAME = process.env.PLAY_PACKAGE_NAME || 'com.nakshatra.astroai';
const [, , trackArg, aabArg, keyArg] = process.argv;

const track = trackArg || 'internal';
const aabPath = aabArg || 'android/app/build/outputs/bundle/release/app-release.aab';
const keyFile = keyArg || process.env.GOOGLE_PLAY_KEY_FILE || 'play-service-account.json';

function fail(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1); }

if (!['internal', 'alpha', 'beta', 'production'].includes(track))
  fail(`Unknown track "${track}". Use one of: internal, alpha, beta, production.`);
if (!existsSync(aabPath))
  fail(`AAB not found at ${aabPath}. Build it first: npm run android:aab`);
if (!existsSync(keyFile))
  fail(`Service-account key not found at ${keyFile}. Point to it with GOOGLE_PLAY_KEY_FILE or pass it as the 3rd argument.`);

const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const publisher = google.androidpublisher({ version: 'v3', auth });

async function main() {
  console.log(`→ Package: ${PACKAGE_NAME}`);
  console.log(`→ Track:   ${track}`);
  console.log(`→ AAB:     ${aabPath}`);

  const { data: edit } = await publisher.edits.insert({ packageName: PACKAGE_NAME });
  const editId = edit.id;

  const bundle = await publisher.edits.bundles.upload({
    packageName: PACKAGE_NAME,
    editId,
    media: { mimeType: 'application/octet-stream', body: readFileSync(aabPath) },
  });
  const versionCode = bundle.data.versionCode;
  console.log(`→ Uploaded bundle, versionCode ${versionCode}`);

  await publisher.edits.tracks.update({
    packageName: PACKAGE_NAME,
    editId,
    track,
    requestBody: { releases: [{ versionCodes: [String(versionCode)], status: 'completed' }] },
  });

  await publisher.edits.commit({ packageName: PACKAGE_NAME, editId });
  console.log(`\n✔ Released versionCode ${versionCode} to '${track}'.\n`);
}

main().catch((err) => {
  const detail = err?.response?.data ? JSON.stringify(err.response.data, null, 2) : (err?.message || err);
  fail(`Upload failed:\n${detail}`);
});
