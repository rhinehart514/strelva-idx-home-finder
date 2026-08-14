import { afterEach, describe, expect, it } from "vitest";
import { Webhook } from "svix";
import { POST } from "../../../app/api/webhooks/resend/route";

const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
  else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
});

describe("Resend webhook boundary", () => {
  it("distinguishes an invalid signature from a valid event whose processing fails", async () => {
    const secret = `whsec_${Buffer.from("a webhook signing secret").toString("base64")}`;
    process.env.RESEND_WEBHOOK_SECRET = secret;
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "provider-message" },
    });
    const id = "msg_test";
    const timestamp = new Date();
    const signature = new Webhook(secret).sign(id, timestamp, body);
    const headers = {
      "svix-id": id,
      "svix-timestamp": String(Math.floor(timestamp.getTime() / 1_000)),
      "svix-signature": signature,
    };
    await expect(
      POST(
        new Request("http://localhost/api/webhooks/resend", {
          method: "POST",
          body,
          headers,
        }),
      ),
    ).resolves.toMatchObject({ status: 503 });

    await expect(
      POST(
        new Request("http://localhost/api/webhooks/resend", {
          method: "POST",
          body,
          headers: { ...headers, "svix-signature": "v1,invalid" },
        }),
      ),
    ).resolves.toMatchObject({ status: 400 });
  });
});
