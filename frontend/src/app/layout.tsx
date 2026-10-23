import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FitMe — AI-Powered Personalized Calorie Tracker",
  description: "Personalized calorie recommendations, intelligent Indian & global food calorie estimation, and mindful fitness tracking.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-cream text-charcoal antialiased selection:bg-sage/20 selection:text-charcoal">
        {children}
      </body>
    </html>
  );
}
