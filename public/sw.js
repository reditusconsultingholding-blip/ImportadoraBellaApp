// Service worker: recibe los avisos aunque la app esté cerrada.
//
// Es lo único que puede correr sin la pestaña abierta, así que acá vive todo lo
// que tiene que pasar cuando llega un push.

self.addEventListener("push", (evento) => {
  let datos = { titulo: "Jarvis", cuerpo: "Tienes un aviso nuevo.", url: "/dashboard" };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {
    // Un aviso con cuerpo raro se muestra igual con el texto por defecto: es
    // mejor que no mostrar nada.
  }

  evento.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      // El icono del aviso apuntaba a /icono-192.png, que NO EXISTE: la ruta
      // daba 404 y todas las notificaciones salían con la campanita genérica
      // del navegador, sin marca. No fallaba nada a la vista, simplemente no
      // se veía. Se usa el mismo icono de la pestaña, que sí está y es SVG:
      // Chrome lo acepta para los avisos y escala solo a cualquier tamaño.
      icon: "/icon.svg",
      badge: "/icon.svg",
      // La etiqueta agrupa: un aviso nuevo del mismo tipo reemplaza al anterior
      // en vez de apilar diez notificaciones del mismo producto.
      tag: datos.etiqueta || "jarvis",
      data: { url: datos.url || "/dashboard" },
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || "/dashboard";

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app ya está abierta se reutiliza esa ventana: abrir una segunda
      // pestaña de lo mismo es molesto.
      for (const v of ventanas) {
        if (v.url.includes(self.location.origin) && "focus" in v) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
