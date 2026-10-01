import Stripe from "stripe";
import { getAdminStore } from "@/lib/backend";
import { json } from "@/lib/server/http";

export const runtime = "nodejs";

const ACTIVE = new Set(["active", "trialing"]);

// The only writer of plan entitlements. Signature verified on the raw body, and plan rows are
// written with the service role, so nothing reachable from a browser can grant Pro.
export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const admin = getAdminStore();
  if (!key || !secret || !admin) return json({ ok: false, error: "Billing is not configured" }, 503);

  const stripe = new Stripe(key);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return json({ ok: false, error: "Invalid signature" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    if (s.mode === "subscription" && s.client_reference_id) {
      await admin.setPlan(s.client_reference_id, "pro", {
        customerId: typeof s.customer === "string" ? s.customer : s.customer?.id,
        subscriptionId: typeof s.subscription === "string" ? s.subscription : s.subscription?.id,
        status: "active",
      });
    }
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const sub = event.data.object;
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const userId = await admin.userIdForCustomer(customerId);
    if (userId) {
      const active = event.type === "customer.subscription.updated" && ACTIVE.has(sub.status);
      await admin.setPlan(userId, active ? "pro" : "free", { customerId, subscriptionId: sub.id, status: sub.status });
    }
  }

  return json({ ok: true });
}
