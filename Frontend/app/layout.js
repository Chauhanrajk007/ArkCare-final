import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import AuthProvider from "@/components/AuthProvider";
import SocketProvider from "@/components/SocketProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ArkCare",
  description: "Your personalized healthcare companion",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
          crossOrigin="anonymous"
        />
        <div className="ark-shell">
          <div className="ark-content">
            <AuthProvider>
              <SocketProvider>{children}</SocketProvider>
            </AuthProvider>
          </div>
        </div>
      </body>
    </html>
  );
}
