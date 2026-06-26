import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DocChat — Chat with your documents",
  description:
    "Upload a document and ask questions about it. Answers are grounded in your content, streamed in real time, with source citations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Apply saved theme before paint to avoid a flash (dashboard defaults to dark) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if((localStorage.getItem('theme')||'dark')==='dark')document.documentElement.classList.add('dark')}catch(e){document.documentElement.classList.add('dark')}`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
