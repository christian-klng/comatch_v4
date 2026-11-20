import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createLogMailer, createSmtpMailer } from "./mailer.ts";

/** Kleinster SMTP-Server, der eine Mail annimmt und den Dialog mitschreibt. */
function fakeSmtp() {
  const received: string[] = [];
  const server = net.createServer((socket) => {
    // Zeilenweise lesen: TCP darf Befehle und Mailtext beliebig auf Pakete verteilen.
    let inData = false;
    let pending = "";
    socket.write("220 test ESMTP\r\n");
    socket.on("data", (chunk) => {
      received.push(chunk.toString());
      pending += chunk.toString();
      let end: number;
      while ((end = pending.indexOf("\r\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (inData) {
          if (line !== ".") continue;
          inData = false;
          socket.write("250 OK\r\n");
          continue;
        }
        const command = line.slice(0, 4).toUpperCase();
        if (command === "EHLO") socket.write("250 test\r\n");
        else if (command === "DATA") {
          inData = true;
          socket.write("354 Go\r\n");
        } else if (command === "QUIT") socket.end("221 Bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  return { server, received };
}

let open: net.Server | undefined;
afterEach(() => open?.close());

describe("Mailer", () => {
  it("verschickt über SMTP mit Absender, Empfänger und Betreff", async () => {
    const { server, received } = fakeSmtp();
    open = server;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;

    const mailer = createSmtpMailer(`smtp://127.0.0.1:${port}`, "CoMatch <noreply@comatch.test>");
    expect(mailer.enabled).toBe(true);
    await mailer.send({ to: "neu@test.local", subject: "Einladung", text: "Hallo\nhttp://comatch.test/x" });

    const dialog = received.join("");
    expect(dialog).toContain("MAIL FROM:<noreply@comatch.test>");
    expect(dialog).toContain("RCPT TO:<neu@test.local>");
    expect(dialog).toContain("Subject: Einladung");
    expect(dialog).toContain("http://comatch.test/x");
  });

  it("schreibt ohne SMTP die Mail nur in der Entwicklung ins Log", async () => {
    const mail = { to: "a@test.local", subject: "Betreff", text: "Link: http://x/geheim" };
    const dev: string[] = [];
    const mailer = createLogMailer((line) => dev.push(line), true);
    expect(mailer.enabled).toBe(false);
    await mailer.send(mail);
    expect(dev.join("\n")).toContain("http://x/geheim");

    const prod: string[] = [];
    await createLogMailer((line) => prod.push(line), false).send(mail);
    expect(prod.join("\n")).toContain("Betreff");
    expect(prod.join("\n")).not.toContain("geheim");
    expect(prod.join("\n")).not.toContain("a@test.local");
  });
});
