// backend/lib/googleSheets.js
// ============================================================
// Appends a lead row to a client's Google Sheet.
// DEMO MODE: if Google credentials are not set, this logs to the
// console instead of calling the real API, so the rest of the
// system works end-to-end before you connect real credentials.
// ============================================================

import { google } from 'googleapis';

const DEMO_MODE = !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET;

function getAuthClient() {
  // Service-account style auth. In production, store a service account
  // JSON key as GOOGLE_SERVICE_ACCOUNT_KEY (base64-encoded) and share
  // each client's Sheet with the service account's email.
  const credentials = JSON.parse(
    Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '', 'base64').toString('utf-8') || '{}'
  );
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
}

/**
 * @param {string} sheetUrlOrId - the client's Google Sheet URL or ID (from `clients.google_sheet_url`)
 * @param {object} lead - a row from the `leads` table
 */
export async function appendLeadToSheet(sheetUrlOrId, lead) {
  const row = [
    new Date().toISOString(),
    lead.customer_name || '',
    lead.customer_whatsapp || '',
    lead.message_summary || '',
    lead.is_hot_lead ? 'HOT' : '',
    lead.status || 'new'
  ];

  if (DEMO_MODE) {
    console.log('[googleSheets:DEMO MODE] Would append row to sheet', sheetUrlOrId, row);
    return { demo: true, row };
  }

  const spreadsheetId = extractSpreadsheetId(sheetUrlOrId);
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Leads!A:F',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [row] }
  });

  return { demo: false, row };
}

function extractSpreadsheetId(urlOrId) {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : urlOrId;
}
