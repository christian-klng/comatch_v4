import { describe, expect, it } from "vitest";
import { account } from "../db/schema.ts";
import { useTestApp } from "../../test/helpers.ts";

const t = useTestApp({ signupOpen: false });

describe("Registrierung geschlossen (SIGNUP_MODE=closed)", () => {
  it("lehnt neue Konten ab und sagt es der Oberfläche", async () => {
    const app = await t.app();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/signup",
      payload: {
        email: "neu@test.local",
        password: "ein-gutes-passwort",
        accountName: "X",
        acceptTerms: true,
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("signup_closed");
    expect(await t.db.$count(account)).toBe(0);
    expect(t.mailer.sent).toEqual([]);

    const config = await app.inject({ method: "GET", url: "/api/config" });
    expect(config.json()).toEqual({ signupOpen: false });
  });
});
