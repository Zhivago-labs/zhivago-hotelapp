self.addEventListener("push", (event) => {
  let payload = { title: "Zhivago", body: "Você tem uma nova notificação." };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Zhivago", {
      body: payload.body ?? "",
      icon: "/next.svg",
      data: { type: payload.type },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/inbox");
      return undefined;
    })
  );
});
