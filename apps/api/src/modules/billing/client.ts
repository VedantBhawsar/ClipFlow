import { DodoPayments } from "dodopayments";
import { timingSafeEqual, createHmac } from "node:crypto";
import type { Env } from "@clipflow/config";
import type { CheckoutSessionBillingAddress } from "dodopayments/resources/checkout-sessions";
import type { PaymentMethodTypes } from "dodopayments/resources/payments";
import { AppError } from "../../errors/AppError.js";

export interface CheckoutSessionInput {
  dodoProductId: string;
  customerId?: string;
  country?: string;
  billingCurrency?: string;
  returnUrl: string;
  cancelUrl: string;
}

type CountryCode =
  | "AF" | "AL" | "DZ" | "AS" | "AD" | "AO" | "AI" | "AQ" | "AG" | "AR" | "AM" | "AW"
  | "AU" | "AT" | "AZ" | "BS" | "BH" | "BD" | "BB" | "BY" | "BE" | "BZ" | "BJ" | "BM"
  | "BT" | "BO" | "BQ" | "BA" | "BW" | "BV" | "BR" | "IO" | "BN" | "BG" | "BF" | "BI"
  | "CV" | "KH" | "CM" | "CA" | "KY" | "CF" | "TD" | "CL" | "CN" | "CX" | "CC" | "CO"
  | "KM" | "CD" | "CG" | "CK" | "CR" | "HR" | "CU" | "CW" | "CY" | "CZ" | "CI" | "DK"
  | "DJ" | "DM" | "DO" | "EC" | "EG" | "SV" | "GQ" | "ER" | "EE" | "SZ" | "ET" | "FK"
  | "FO" | "FJ" | "FI" | "FR" | "GF" | "PF" | "TF" | "GA" | "GM" | "GE" | "DE" | "GH"
  | "GI" | "GR" | "GL" | "GD" | "GP" | "GU" | "GT" | "GG" | "GN" | "GW" | "GY" | "HT"
  | "HM" | "VA" | "HN" | "HK" | "HU" | "IS" | "IN" | "ID" | "IR" | "IQ" | "IE" | "IM"
  | "IL" | "IT" | "JM" | "JP" | "JE" | "JO" | "KZ" | "KE" | "KI" | "KP" | "KR" | "KW"
  | "KG" | "LA" | "LV" | "LB" | "LS" | "LR" | "LY" | "LI" | "LT" | "LU" | "MO" | "MG"
  | "MW" | "MY" | "MV" | "ML" | "MT" | "MH" | "MQ" | "MR" | "MU" | "YT" | "MX" | "FM"
  | "MD" | "MC" | "MN" | "ME" | "MS" | "MA" | "MZ" | "MM" | "NA" | "NR" | "NP" | "NL"
  | "NC" | "NZ" | "NI" | "NE" | "NG" | "NU" | "NF" | "MK" | "MP" | "NO" | "OM" | "PK"
  | "PW" | "PS" | "PA" | "PG" | "PY" | "PE" | "PH" | "PN" | "PL" | "PT" | "PR" | "QA"
  | "RO" | "RU" | "RW" | "RE" | "BL" | "SH" | "KN" | "LC" | "MF" | "PM" | "VC" | "WS"
  | "SM" | "ST" | "SA" | "SN" | "RS" | "SC" | "SL" | "SG" | "SX" | "SK" | "SI" | "SB"
  | "SO" | "ZA" | "GS" | "SS" | "ES" | "LK" | "SD" | "SR" | "SJ" | "SE" | "CH" | "SY"
  | "TW" | "TJ" | "TZ" | "TH" | "TL" | "TG" | "TK" | "TO" | "TT" | "TN" | "TR" | "TM"
  | "TC" | "TV" | "UG" | "UA" | "AE" | "GB" | "US" | "UM" | "UY" | "UZ" | "VU" | "VE"
  | "VN" | "VG" | "VI" | "WF" | "EH" | "YE" | "ZM" | "ZW" | "AX";

export class BillingClient {
  public readonly client: DodoPayments;
  private supportedCountries: CountryCode[] = [];

  constructor(private readonly env: Env) {
    this.client = new DodoPayments({
      bearerToken: env.DODO_PAYMENTS_API_KEY,
      environment: env.DODO_PAYMENTS_ENVIRONMENT as "test_mode" | "live_mode",
    });
  }

  async init(): Promise<void> {
    try {
      this.supportedCountries = await this.client.misc.listSupportedCountries() as unknown as CountryCode[];
    } catch {
      this.supportedCountries = [];
    }
  }

  countrySupported(code: string): boolean {
    return this.supportedCountries.includes(code.toUpperCase() as unknown as CountryCode);
  }

  isInSupported(): boolean {
    return this.countrySupported("IN");
  }

  async createCheckoutSession(input: CheckoutSessionInput) {
    const billingAddress: CheckoutSessionBillingAddress | undefined = input.country
      ? { country: input.country.toUpperCase() as CountryCode }
      : undefined;

    const allowedMethods: PaymentMethodTypes[] | undefined = input.country?.toUpperCase() === "IN"
      ? ["upi_intent", "card_redirect"] as PaymentMethodTypes[]
      : undefined;

    const session = await this.client.checkoutSessions.create({
      product_cart: [{ product_id: input.dodoProductId, quantity: 1 }],
      customer: input.customerId ? { customer_id: input.customerId } : undefined,
      billing_address: billingAddress,
      allowed_payment_method_types: allowedMethods,
      billing_currency: input.billingCurrency as "INR" | "USD" | undefined,
      return_url: input.returnUrl,
      cancel_url: input.cancelUrl,
    });

    return {
      checkoutUrl: session.checkout_url ?? "",
      sessionId: session.session_id,
    };
  }

  async cancelSubscription(dodoSubscriptionId: string): Promise<void> {
    await this.client.subscriptions.update(dodoSubscriptionId, {
      cancel_at_next_billing_date: true,
    });
  }

  async getCustomerPortalUrl(dodoCustomerId: string): Promise<string | null> {
    try {
      const portal = await (this.client as unknown as {
        customers: { customerPortal: { create: (id: string) => Promise<Record<string, unknown>> } };
      }).customers.customerPortal.create(dodoCustomerId);
      return (portal.url as string | undefined) ?? null;
    } catch {
      return null;
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string,
    timestamp: string,
  ): boolean {
    const parts = signatureHeader.split(",");
    const versionPart = parts[0];
    const signaturePart = parts[1];
    if (!versionPart || !signaturePart) return false;

    const signedContent = `${timestamp}.${rawBody.toString("utf8")}`;
    const expectedSig = createHmac("sha256", this.env.DODO_PAYMENTS_WEBHOOK_SECRET)
      .update(signedContent)
      .digest("hex");

    return timingSafeEqual(
      Buffer.from(signaturePart),
      Buffer.from(expectedSig),
    );
  }

  get supportedCountriesList(): string[] {
    return [...this.supportedCountries];
  }
}

let instance: BillingClient | null = null;

export function initBillingClient(env: Env): BillingClient {
  if (!instance) {
    instance = new BillingClient(env);
  }
  return instance;
}

export function getBillingClient(): BillingClient {
  if (!instance) throw new Error("BillingClient not initialized. Call initBillingClient(env) first.");
  return instance;
}