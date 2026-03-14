import { google } from "googleapis";
import { prisma } from "@/server/db/client";

async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });

  if (!account?.refresh_token) {
    throw new Error("No Google account linked. Please sign in again.");
  }

  const isExpired = !account.expires_at || account.expires_at * 1000 < Date.now();

  if (account.access_token && !isExpired) {
    return account.access_token;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
  );
  oauth2.setCredentials({ refresh_token: account.refresh_token });

  const { credentials } = await oauth2.refreshAccessToken();

  await prisma.account.updateMany({
    where: { userId, provider: "google" },
    data: {
      access_token: credentials.access_token,
      expires_at: credentials.expiry_date
        ? Math.floor(credentials.expiry_date / 1000)
        : null,
    },
  });

  return credentials.access_token!;
}

export async function getGoogleSheetsClient(userId: string) {
  const accessToken = await getAccessToken(userId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

export async function getGoogleDriveClient(userId: string) {
  const accessToken = await getAccessToken(userId);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}
