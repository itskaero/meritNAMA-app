import "server-only";
import nodemailer from "nodemailer";
import { devOutbox } from "@/lib/db/schema";
import type { Db } from "@/lib/data/shared";
import { env } from "@/lib/env";

export type Mail = { to: string; subject: string; text: string };

let transport: nodemailer.Transporter | undefined;

/**
 * Send one plain-text email through SMTP_URL. Without SMTP outside production the
 * message is written to dev_outbox instead and can be read at /dev/mailbox.
 */
export async function sendMail(db: Db, mail: Mail) {
  const { SMTP_URL, MAIL_FROM, NODE_ENV } = env();
  if (SMTP_URL) {
    transport ??= nodemailer.createTransport(SMTP_URL);
    await transport.sendMail({ from: MAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text });
    return;
  }
  if (NODE_ENV === "production") throw new Error("SMTP_URL is not configured");
  await db.insert(devOutbox).values({ to: mail.to, subject: mail.subject, body: mail.text });
}
