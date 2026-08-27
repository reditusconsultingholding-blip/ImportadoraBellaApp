import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist para la interfaz: dibujada para pantallas densas de datos, con
// números de ancho fijo — que es lo que necesitan Rentabilidad, Nómina y el
// panel. Poppins (la anterior) es geométrica y ancha: linda para un título,
// incómoda para una tabla de 12 columnas.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Importadora Bella",
  description: "Panel de campañas, ventas y pipeline creativo de Importadora Bella.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
