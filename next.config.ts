import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit (reportes diarios en PDF) lee sus archivos .afm de fuentes con
  // rutas relativas a __dirname — el bundling de Turbopack los rompe. Se
  // marca como paquete externo para que corra con require() normal de Node.
  serverExternalPackages: ["pdfkit"],
};

export default nextConfig;
