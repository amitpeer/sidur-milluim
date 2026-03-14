import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "סידור מילואים",
  description: "מערכת לניהול תורנויות מילואים",
  manifest: "/manifest.json",
  themeColor: "#18181b",
  verification: {
    google: "AbXTYtZwSrMQetVo42rQeDQfEDvfHQ8NxB12zb6XyuY",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
