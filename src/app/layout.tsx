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
  description: "Panel de campañas, ventas y contenido creativo de Importadora Bella.",
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
      <head>
        {/*
          EL TEMA SE APLICA ANTES DE QUE SE PINTE NADA.

          Si esto corriera en un efecto de React, la primera pintura saldría con
          el tema del sistema y recién después cambiaría: quien eligió claro
          teniendo el equipo en oscuro vería un fogonazo negro en cada carga.
          Un script sin `defer` en el <head> corre antes del primer pintado y
          eso no pasa.

          Va en línea y no en un archivo aparte por lo mismo: un archivo
          externo se descarga, y en esa espera ya se pintó.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('jarvis-tema');if(t==='claro'||t==='oscuro')document.documentElement.setAttribute('data-tema',t)}catch(e){}",
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
