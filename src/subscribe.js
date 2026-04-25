#!/usr/bin/env node
/**
 * Register (or list/revoke) Withings webhook subscriptions.
 *
 * Usage:
 *   node src/subscribe.js --user <name> --action subscribe   # register
 *   node src/subscribe.js --user <name> --action list        # list active
 *   node src/subscribe.js --user <name> --action revoke      # remove all
 *
 * Requires SERVER_HOST, PORT, WEBHOOK_SECRET, WITHINGS_CLIENT_ID/SECRET in .env
 */

import axios from 'axios';
import { getAccessToken } from './auth.js';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
};

const USER   = arg('--user') || 'charles';
const ACTION = arg('--action') || 'list';

// WEBHOOK_CALLBACK_URL must be the bare public URL registered in the Withings developer portal.
// Withings requires an exact match — no path or query string allowed.
// e.g. https://withings.aldarondo.family
const WEBHOOK_CALLBACK_URL = process.env.WEBHOOK_CALLBACK_URL;

if (!WEBHOOK_CALLBACK_URL) { console.error('WEBHOOK_CALLBACK_URL must be set in .env (e.g. https://withings.aldarondo.family)'); process.exit(1); }

const CALLBACK_BASE = WEBHOOK_CALLBACK_URL;

// appli types to subscribe: 1=weight, 4=heart rate
const APPLI_TYPES = [1, 4];

async function callNotify(accessToken, params) {
  const { data } = await axios.get('https://wbsapi.withings.net/notify', {
    params,
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

const token = await getAccessToken(USER);

if (ACTION === 'subscribe') {
  for (const appli of APPLI_TYPES) {
    const label = appli === 1 ? 'weight' : 'heart rate';
    const data = await callNotify(token, {
      action: 'subscribe',
      callbackurl: CALLBACK_BASE,
      appli,
    });
    if (data.status === 0) {
      console.log(`✅ Subscribed to ${label} (appli=${appli}) for ${USER}`);
    } else {
      console.error(`❌ Failed to subscribe to ${label}: status ${data.status} — ${data.error || 'unknown'}`);
    }
  }

} else if (ACTION === 'list') {
  const data = await callNotify(token, { action: 'list', appli: 1 });
  console.log(JSON.stringify(data, null, 2));

} else if (ACTION === 'revoke') {
  for (const appli of APPLI_TYPES) {
    const label = appli === 1 ? 'weight' : 'heart rate';
    const data = await callNotify(token, {
      action: 'revoke',
      callbackurl: CALLBACK_BASE,
      appli,
    });
    if (data.status === 0) {
      console.log(`✅ Revoked ${label} subscription for ${USER}`);
    } else {
      console.error(`❌ Failed to revoke ${label}: status ${data.status} — ${data.error || 'unknown'}`);
    }
  }

} else {
  console.error(`Unknown action "${ACTION}". Use: subscribe | list | revoke`);
  process.exit(1);
}
