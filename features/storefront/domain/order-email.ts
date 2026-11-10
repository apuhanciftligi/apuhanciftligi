/**
 * Pure builder for the customer order-confirmation email. No I/O — takes the
 * order facts, returns { subject, html, text }. Kept pure so it's unit-testable
 * and the sending transport (Resend) stays a thin infrastructure concern.
 *
 * Money arrives in kuruş and is formatted at this edge (CLAUDE.md §7).
 */
import { formatTRY } from "@/shared/utils/money";

import { COMPANY } from "@/features/storefront/domain/legal";

export interface OrderEmailLine {
  readonly name: string;
  readonly quantity: number;
  readonly lineTotalMinor: number;
}

export interface OrderEmailBankTransfer {
  readonly iban: string;
  readonly accountHolder: string;
  readonly bankName: string;
  readonly whatsappUrl: string;
}

export interface OrderEmailInput {
  readonly orderNumber: string;
  readonly customerName: string;
  /**
   * How the order reaches the customer. A delivery names the day the van comes;
   * a cargo order deliberately does NOT — the owner dropped the "hazırlanma
   * günü" question for out-of-city parcels, so `scheduledFor` on those rows is
   * an internal ops date the customer never chose and must not be shown as a
   * promise.
   */
  readonly channel: "delivery" | "shipping";
  readonly scheduledFor: string;
  readonly timeSlotLabel: string | null;
  readonly paymentMethodLabel: string;
  readonly addressText: string;
  readonly items: ReadonlyArray<OrderEmailLine>;
  readonly subtotalMinor: number;
  readonly deliveryFeeMinor: number;
  readonly totalMinor: number;
  /** Present only when payment_method is "bank_transfer" — no gateway in
   *  Faz 1 (SPEC.md §1.3), so the IBAN + a pre-filled WhatsApp link is the
   *  entire payment instruction the customer gets. */
  readonly bankTransfer: OrderEmailBankTransfer | null;
}

export interface BuiltEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatQty = (quantity: number): string =>
  quantity.toLocaleString("tr-TR", { maximumFractionDigits: 2 });

export function buildOrderConfirmationEmail(input: OrderEmailInput): BuiltEmail {
  const subject = `Siparişiniz alındı — ${input.orderNumber}`;
  const greetingName = input.customerName.trim();
  const greeting = greetingName ? `Merhaba ${greetingName},` : "Merhaba,";
  const isCargo = input.channel === "shipping";
  const deliveryFee =
    input.deliveryFeeMinor === 0 ? "Ücretsiz" : formatTRY(input.deliveryFeeMinor);
  const feeLabel = isCargo ? "Kargo" : "Teslimat";
  const slot = input.timeSlotLabel ? ` (${input.timeSlotLabel})` : "";
  const scheduleLabel = isCargo ? "Gönderim" : "Teslimat günü";
  const scheduleValue = isCargo
    ? "Siparişiniz hazırlanıp kargoya verilecektir."
    : `${input.scheduledFor}${slot}`;
  const trackingUrl = `${COMPANY.siteUrl}/siparis-sorgula`;
  const intro =
    "Apuhan Çiftliği'ni tercih ettiğiniz için teşekkür ederiz. Siparişinizi aldık; ürünlerinizi özenle hazırlayacağız.";

  const itemsText = input.items
    .map(
      (i) =>
        `  - ${i.name} × ${formatQty(i.quantity)} — ${formatTRY(i.lineTotalMinor)}`,
    )
    .join("\n");

  const bt = input.bankTransfer;
  const bankTransferText = bt
    ? [
        "",
        "Havale/EFT bilgileri:",
        `  IBAN: ${bt.iban}`,
        `  Hesap sahibi: ${bt.accountHolder}`,
        `  Banka: ${bt.bankName}`,
        `  Açıklamaya sipariş numaranızı yazın: ${input.orderNumber}`,
        `  Dekontu WhatsApp'tan gönderin: ${bt.whatsappUrl}`,
      ]
    : [];

  const text = [
    greeting,
    "",
    `Siparişiniz alındı. Sipariş numaranız: ${input.orderNumber}`,
    intro,
    "",
    "Ürünler:",
    itemsText,
    "",
    `Ara toplam: ${formatTRY(input.subtotalMinor)}`,
    `${feeLabel}: ${deliveryFee}`,
    `Toplam: ${formatTRY(input.totalMinor)}`,
    "",
    `${scheduleLabel}: ${scheduleValue}`,
    `Adres: ${input.addressText}`,
    `Ödeme: ${input.paymentMethodLabel}`,
    ...bankTransferText,
    "",
    `Siparişinizi sorgulayın: ${trackingUrl}`,
    "Sipariş numaranız ve siparişte kullandığınız telefon numarasıyla sorgulama yapabilirsiniz.",
    "",
    "Teşekkürler,",
    COMPANY.brand,
    `İletişim: ${COMPANY.phone} | ${COMPANY.email}`,
    COMPANY.siteUrl,
  ].join("\n");

  const itemsHtml = input.items
    .map(
      (i) => `
        <tr>
          <td style="padding:16px 12px 16px 0;border-bottom:1px solid #d9cbb0;vertical-align:top;overflow-wrap:break-word;word-wrap:break-word;">
            <strong style="font-size:16px;font-weight:600;">${escapeHtml(i.name)}</strong><br />
            <span style="font-size:14px;color:#5c4c3d;">Miktar: ${formatQty(i.quantity)}</span>
          </td>
          <td style="padding:16px 0;border-bottom:1px solid #d9cbb0;text-align:right;vertical-align:top;font-size:16px;white-space:nowrap;">${formatTRY(i.lineTotalMinor)}</td>
        </tr>`,
    )
    .join("");

  const bankTransferHtml = bt
    ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
      <tr>
        <td bgcolor="#fce8c8" style="padding:20px;border:1px solid #d9cbb0;border-radius:12px;">
          <h2 style="margin:0 0 12px;font-size:18px;line-height:1.4;color:#2a1c12;">Havale/EFT bilgileri</h2>
          <p style="margin:0;font-size:15px;line-height:1.7;overflow-wrap:break-word;word-wrap:break-word;">
            IBAN: <strong>${escapeHtml(bt.iban)}</strong><br />
            Hesap sahibi: ${escapeHtml(bt.accountHolder)}<br />
            Banka: ${escapeHtml(bt.bankName)}
          </p>
          <p style="margin:12px 0;font-size:15px;line-height:1.7;">
            Açıklamaya sipariş numaranızı yazın: <strong>${escapeHtml(input.orderNumber)}</strong>
          </p>
          <a href="${escapeHtml(bt.whatsappUrl)}" style="display:inline-block;padding:10px 0;color:#1b4a26;font-size:15px;font-weight:700;text-decoration:underline;">Dekontu WhatsApp'tan gönderin</a>
        </td>
      </tr>
    </table>`
    : "";

  const html = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
    <style>
      @media only screen and (max-width:480px) {
        .email-outer { padding:24px 12px !important; }
        .email-content { padding:28px 20px !important; }
        .email-title { font-size:30px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#fffdf9;color:#2a1c12;-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(input.orderNumber)} numaralı siparişinizi aldık. Çiftliğimizden sofranıza, özenle.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffdf9" style="width:100%;background-color:#fffdf9;">
      <tr>
        <td class="email-outer" align="center" style="padding:36px 16px;">
          <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#2a1c12;">
            <tr>
              <td align="center" style="padding-bottom:28px;">
                <a href="${escapeHtml(COMPANY.siteUrl)}" style="color:#1b4a26;text-decoration:none;">
                  <img src="${escapeHtml(COMPANY.siteUrl)}/brand/apuhan-email-logo.png" width="76" height="76" alt="Apuhan Çiftliği logosu" style="display:block;width:76px;height:76px;margin:0 auto 12px;border:0;" />
                  <span style="font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.5px;">${escapeHtml(COMPANY.brand)}</span>
                </a>
                <p style="margin:6px 0 0;font-size:14px;line-height:1.5;color:#5c4c3d;">Akçadağ, Malatya</p>
              </td>
            </tr>
            <tr>
              <td class="email-content" bgcolor="#ffffff" style="padding:36px;border:1px solid #d9cbb0;border-top:5px solid #1b4a26;border-radius:16px;background-color:#ffffff;">
                <p style="margin:0 0 12px;font-size:12px;line-height:1.5;font-weight:700;letter-spacing:1.4px;color:#1b4a26;">ÇİFTLİKTEN SOFRANIZA</p>
                <h1 class="email-title" style="margin:0 0 24px;font-size:36px;line-height:1.15;letter-spacing:-1px;color:#1b4a26;">Siparişiniz alındı.</h1>
                <p style="margin:0 0 10px;font-size:16px;line-height:1.7;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#5c4c3d;">${escapeHtml(intro)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td bgcolor="#e4eedd" style="padding:18px 20px;border-radius:12px;background-color:#e4eedd;">
                      <p style="margin:0 0 4px;font-size:13px;line-height:1.5;color:#1b4a26;">Sipariş numaranız</p>
                      <p style="margin:0;font-size:20px;line-height:1.5;font-weight:700;color:#1b4a26;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(input.orderNumber)}</p>
                    </td>
                  </tr>
                </table>

                <h2 style="margin:28px 0 8px;font-size:20px;line-height:1.4;">Sipariş özeti</h2>
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;border-collapse:collapse;line-height:1.5;">
                  <thead>
                    <tr>
                      <th scope="col" align="left" style="padding:10px 12px 10px 0;border-bottom:1px solid #d9cbb0;font-size:13px;font-weight:400;color:#5c4c3d;">Ürün</th>
                      <th scope="col" width="112" align="right" style="padding:10px 0;border-bottom:1px solid #d9cbb0;font-size:13px;font-weight:400;color:#5c4c3d;">Tutar</th>
                    </tr>
                  </thead>
                  <tbody>${itemsHtml}</tbody>
                </table>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:15px;line-height:1.5;">
                  <tr>
                    <td style="padding-top:18px;color:#5c4c3d;">Ara toplam</td>
                    <td align="right" style="padding-top:18px;white-space:nowrap;">${formatTRY(input.subtotalMinor)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0 18px;color:#5c4c3d;">${escapeHtml(feeLabel)}</td>
                    <td align="right" style="padding:8px 0 18px;white-space:nowrap;">${escapeHtml(deliveryFee)}</td>
                  </tr>
                  <tr>
                    <td bgcolor="#fce8c8" style="padding:16px 12px;border-radius:10px 0 0 10px;font-size:18px;font-weight:700;">Toplam</td>
                    <td bgcolor="#fce8c8" align="right" style="padding:16px 12px;border-radius:0 10px 10px 0;font-size:20px;font-weight:700;white-space:nowrap;">${formatTRY(input.totalMinor)}</td>
                  </tr>
                </table>

                <h2 style="margin:28px 0 14px;font-size:20px;line-height:1.4;">Teslimat ve ödeme</h2>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;">
                  <span style="color:#5c4c3d;">${escapeHtml(scheduleLabel)}</span><br />
                  <strong style="font-weight:600;">${escapeHtml(scheduleValue)}</strong>
                </p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.7;overflow-wrap:break-word;word-wrap:break-word;">
                  <span style="color:#5c4c3d;">Teslimat adresi</span><br />
                  ${escapeHtml(input.addressText)}
                </p>
                <p style="margin:0;font-size:15px;line-height:1.7;">
                  <span style="color:#5c4c3d;">Ödeme yöntemi</span><br />
                  ${escapeHtml(input.paymentMethodLabel)}
                </p>
                ${bankTransferHtml}

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                  <tr>
                    <td align="center" bgcolor="#1b4a26" style="border-radius:12px;background-color:#1b4a26;mso-padding-alt:16px 24px;">
                      <a href="${escapeHtml(trackingUrl)}" style="display:block;padding:16px 24px;border:1px solid #1b4a26;border-radius:12px;font-size:16px;line-height:1.4;font-weight:700;color:#ffffff;text-decoration:none;">Siparişimi sorgula</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:12px 0 0;font-size:13px;line-height:1.7;color:#5c4c3d;">Sipariş numaranız ve siparişte kullandığınız telefon numarasıyla sorgulama yapabilirsiniz.</p>
                <p style="margin:28px 0 0;padding-top:22px;border-top:1px solid #d9cbb0;font-size:16px;line-height:1.7;">Sofranızda bize yer açtığınız için teşekkürler.<br /><strong style="color:#1b4a26;">Apuhan Çiftliği ailesi</strong></p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 12px 0;font-size:14px;line-height:1.8;color:#5c4c3d;overflow-wrap:break-word;word-wrap:break-word;">
                <p style="margin:0 0 8px;">Bir sorunuz varsa bize ulaşabilirsiniz.</p>
                <p style="margin:0;"><a href="tel:${escapeHtml(COMPANY.phone.replace(/[^\d+]/g, ""))}" style="display:inline-block;padding:6px 0;color:#1b4a26;">${escapeHtml(COMPANY.phone)}</a><br /><a href="mailto:${escapeHtml(COMPANY.email)}" style="display:inline-block;padding:6px 0;color:#1b4a26;">${escapeHtml(COMPANY.email)}</a></p>
                <p style="margin:14px 0 0;font-size:12px;line-height:1.7;">Bu e-posta, Apuhan Çiftliği siparişiniz hakkında bilgilendirme amacıyla gönderilmiştir.</p>
              </td>
            </tr>
          </table>
          <!--[if mso]></td></tr></table><![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
