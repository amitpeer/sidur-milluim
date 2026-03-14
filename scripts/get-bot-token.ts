import "dotenv/config";
import { google } from "googleapis";
import { createServer } from "http";

const oauth2 = new google.auth.OAuth2(
  process.env.AUTH_GOOGLE_ID,
  process.env.AUTH_GOOGLE_SECRET,
  "http://localhost:3333/callback",
);

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
  ],
});

console.log("1. Sign in to the bot Google account in your browser");
console.log("2. Open this URL:\n");
console.log(url);
console.log("\nWaiting for callback...");

const server = createServer(async (req, res) => {
  if (!req.url?.startsWith("/callback")) return;

  const code = new URL(req.url, "http://localhost:3333").searchParams.get("code");
  if (!code) {
    res.end("No code received");
    return;
  }

  const { tokens } = await oauth2.getToken(code);

  res.end("Done! You can close this tab.");
  server.close();

  console.log("\nAdd this to your .env:\n");
  console.log(`GOOGLE_BOT_REFRESH_TOKEN="${tokens.refresh_token}"`);
});

server.listen(3333);
