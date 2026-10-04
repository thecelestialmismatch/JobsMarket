import Stripe from "stripe";
import { getBackend } from "@/lib/backend";
import { json, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ ok: false, error: "Request blocked." }, 403);
  const key = process.env.STRIPE_SECRET_KEY;
  const price = process.env.STRIPE_PRICE_ID;
  if (!key || !price) return json({ ok: false, error: "Billing is not switched on yet." }, 503);

  const { user } = await getBackend();
  if (!user) return json({ ok: false, error: "Sign in first." }, 401);

  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const stripe = new Stripe(key);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email || undefined,
    allow_promotion_codes: true,
    success_url: `${origin}/app/settings?billing=success`,
    cancel_url: `${origin}/app/settings?billing=cancelled`,
  });
  return json({ ok: true, url: session.url });
}
