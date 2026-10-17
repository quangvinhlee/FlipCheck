import type { Metadata } from "next";
import "@fontsource-variable/dm-sans";
import "./globals.css";
export const metadata: Metadata = {
  title: "FlipCheck — Your sourcing desk",
  description:
    "A local AI deal scout for Australian used-laptop resellers. Clearer margins, with the evidence to back them up.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
