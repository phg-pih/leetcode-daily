import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeetCode Daily Auto-Submit",
  description: "Automatically solve and submit LeetCode daily challenges",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
