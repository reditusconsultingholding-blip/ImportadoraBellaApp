import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit (reportes diarios en PDF) lee sus archivos .afm de fuentes con
  // rutas relativas a __dirname — el bundling de Turbopack los rompe. Se
  // marca como paquete externo para que corra con require() normal de Node.
  serverExternalPackages: ["pdfkit"],

  // No anunciar el framework en cada respuesta.
  poweredByHeader: false,

  // Encabezados de seguridad para todo el sitio.
  //
  // - HSTS: el navegador solo habla HTTPS con el dominio, aunque alguien
  //   escriba http:// o lo intercepte una red pública.
  // - frame-ancestors / X-Frame-Options: nadie puede meter Jarvis dentro de
  //   un iframe de otro sitio (clickjacking: hacer apretar un botón real
  //   escondido debajo de uno falso).
  // - nosniff: un archivo se interpreta como lo que dice ser, no como lo que
  //   el navegador adivina.
  // - Referrer-Policy: al salir a otro sitio no se manda la URL interna.
  // - Permissions-Policy: cámara y micrófono solo para la propia app (sala de
  //   voz, modo voz de Jarvis); ubicación y pagos, para nadie.
  //
  // No se pone una CSP completa (script-src, etc.): Next inyecta scripts en
  // línea y hacerlo bien exige nonces en cada página. frame-ancestors, que es
  // la parte que protege de verdad, sí va.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
