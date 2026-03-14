import { google } from "googleapis";

function createAuth() {
  const auth = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_BOT_REFRESH_TOKEN });
  return auth;
}

export async function getGoogleSheetsClient() {
  const auth = createAuth();
  return google.sheets({ version: "v4", auth });
}

export async function getGoogleDriveClient() {
  const auth = createAuth();
  return google.drive({ version: "v3", auth });
}
