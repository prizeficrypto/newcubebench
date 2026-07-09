import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";
import { getPromo, submitEarlyAccess } from "../lib/api.ts";

/**
 * Two plans. Pro is a real Stripe subscription ($3.49/mo, 3-day trial) when
 * billing is configured; until then it falls back to an honest early-access
 * email capture — no fake checkout ever.
 */
type Plan = "monthly" | "annual";

export default function Pricing() {
  const { user, billingAvailable, startCheckout, openPortal, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>("annual");

  // Which state the visitor is in. `onPromo` = signed-in on the free "first
  // 100" month (Pro via promoUntil, no Stripe sub, so no Manage button).
  // `proViaStripe` = Pro but not on the promo month (a real subscription).
  // Everyone else (signed-in free or guest) sees the plan cards + promo banner.
  const onPromo = Boolean(user?.promoUntil && user.promoUntil > Date.now());
  const proViaStripe = Boolean(user?.pro) && !onPromo;
  const showPlans = !onPromo && !proViaStripe;

  // Returning from Stripe Checkout: refresh the plan and show the outcome.
  useEffect(() => {
    const upgrade = params.get("upgrade");
    if (!upgrade) return;
    if (upgrade === "success") {
      setNotice("You're on Pro. Your 3-day free trial has started.");
      refresh();
    } else if (upgrade === "cancelled") {
      setNotice("No worries. Checkout was cancelled and nothing was charged.");
    }
    params.delete("upgrade");
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen container pricing">
      <div className="pricing__head">
        <span className="eyebrow">{showPlans ? "Pricing" : "Your account"}</span>
        <h1 className="title">
          {showPlans
            ? "Practice free. Benchmark any competition with Pro."
            : "You're on Cube Bench Pro."}
        </h1>
      </div>

      {notice && <div className="card pricing__notice">{notice}</div>}

      {onPromo && user?.promoUntil && (
        <div className="card pricing__plan">
          <span className="why__label why__label--accent">Your plan</span>
          <p className="pricing__plan-name">Cube Bench Pro, free month</p>
          <p className="muted">
            Your free month ends {formatPromoEnd(user.promoUntil)}. No card needed.
          </p>
        </div>
      )}

      {proViaStripe && (
        <div className="card pricing__plan">
          <span className="why__label why__label--accent">Your plan</span>
          <p className="pricing__plan-name">Cube Bench Pro</p>
          <p className="muted">Your subscription is active.</p>
          <ManageSubscription openPortal={openPortal} />
        </div>
      )}

      {showPlans && <PromoBanner isGuest={!user} />}

      {showPlans && (
      <div className="card pricing__card">
        <div className="pricing__col">
          <span className="why__label">Free</span>
          <p className="plan__price">
            <span className="plan__amount mono">$0</span>
          </p>
          <ul className="plan__features">
            <li>Three featured competitions to simulate</li>
            <li>Unlimited practice on the regular timer</li>
            <li>Real scrambles, real fields, exact WCA scoring</li>
          </ul>
          <Link className="btn btn--secondary plan__cta" to="/app">
            Start solving
          </Link>
        </div>

        <div className="pricing__divider" aria-hidden="true" />

        <div className="pricing__col">
          <span className="why__label why__label--accent">Pro</span>

          <div className="plan__toggle" role="group" aria-label="Billing period">
            <button
              className={`plan__toggle-btn${plan === "monthly" ? " is-active" : ""}`}
              onClick={() => setPlan("monthly")}
              aria-pressed={plan === "monthly"}
            >
              Monthly
            </button>
            <button
              className={`plan__toggle-btn${plan === "annual" ? " is-active" : ""}`}
              onClick={() => setPlan("annual")}
              aria-pressed={plan === "annual"}
            >
              Yearly
              <span className="plan__save">Save 40%</span>
            </button>
          </div>

          <p className="plan__price">
            {plan === "monthly" ? (
              <>
                <span className="plan__amount mono">$3.49</span>
                <span className="plan__per">/month</span>
              </>
            ) : (
              <>
                <span className="plan__amount mono">$25</span>
                <span className="plan__per">/year · $2.08/mo, billed yearly</span>
              </>
            )}
          </p>
          <ul className="plan__features">
            <li>The entire WCA competition library</li>
            <li>Everything in Free</li>
            <li className="plan__feature--soon">
              Skill Timer, stage-split timing
              <span className="plan__soon">Coming soon</span>
            </li>
          </ul>
          <ProAction
            isPro={Boolean(user?.pro)}
            billingAvailable={billingAvailable}
            plan={plan}
            startCheckout={startCheckout}
            openPortal={openPortal}
          />
        </div>
      </div>
      )}

      {showPlans && (
        <p className="pricing__note tertiary">
          {billingAvailable
            ? "Cancel anytime. Your free trial won't be charged until it ends, and yearly saves 40% over paying monthly."
            : "Pro is launching soon. No payment is taken now."}
        </p>
      )}

      <div className="faq pricing__faq">
        <span className="eyebrow pricing__faq-head">Questions</span>
        {[
          {
            q: "Can I cancel whenever I want?",
            a: "Yes. Manage or cancel from the billing portal at any time. If you cancel, Pro stays active until the end of the period you've already paid for.",
          },
          {
            q: "What happens after the free trial?",
            a: "The subscription renews at $3.49 a month, or $25 a year if you pick yearly (a 40% saving). Cancel during the trial and you pay nothing at all.",
          },
          {
            q: "Is my card information safe?",
            a: "Checkout is hosted by Stripe, so your card details go to Stripe and never touch our servers.",
          },
        ].map((item) => (
          <details className="faq__item" key={item.q}>
            <summary className="faq__q">
              {item.q}
              <span className="faq__toggle" aria-hidden="true">
                +
              </span>
            </summary>
            <p className="muted faq__a">{item.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

/** "August 8, 2026" from an epoch-ms timestamp. */
function formatPromoEnd(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "Manage subscription" — opens the Stripe billing portal (Stripe subs only). */
function ManageSubscription({ openPortal }: { openPortal: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="plan__cta-wrap">
      <button
        className="btn btn--secondary plan__cta"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await openPortal(); // redirects to Stripe on success
          } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening…" : "Manage subscription"}
      </button>
      {error && <p className="plan__error">{error}</p>}
    </div>
  );
}

/**
 * The "first 100" incentive. For a not-Pro visitor, fetch the live spot count.
 * While spots remain we show a calm banner; a guest gets a "Create a free
 * account" link, a signed-in free user just sees the normal Pro upgrade below.
 * Once spots run out (remaining === 0) we show nothing at all.
 */
function PromoBanner({ isGuest }: { isGuest: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPromo()
      .then((p) => {
        if (!cancelled) setRemaining(p.remaining);
      })
      .catch(() => {
        /* the promo banner is a bonus; a failure just hides it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (remaining === null || remaining <= 0) return null;

  return (
    <div className="card pricing__promo">
      <span className="why__label why__label--accent">Free for the first 100</span>
      <p className="pricing__promo-copy">
        First 100 sign-ups get Cube Bench Pro free for a month. No card.{" "}
        <strong>{remaining} of 100 spots left.</strong>
      </p>
      {isGuest && (
        <Link className="btn plan__cta pricing__promo-cta" to="/join">
          Create a free account
        </Link>
      )}
    </div>
  );
}

function ProAction({
  isPro,
  billingAvailable,
  plan,
  startCheckout,
  openPortal,
}: {
  isPro: boolean;
  billingAvailable: boolean;
  plan: Plan;
  startCheckout: (plan?: Plan) => Promise<void>;
  openPortal: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(fn: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await fn(); // redirects to Stripe on success
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  if (isPro) {
    return (
      <div className="plan__cta-wrap">
        <p className="plan__done">You're on Pro. Thanks for the support.</p>
        <button
          className="btn btn--secondary plan__cta"
          disabled={busy}
          onClick={() => go(openPortal)}
        >
          {busy ? "Opening…" : "Manage subscription"}
        </button>
        {error && <p className="plan__error">{error}</p>}
      </div>
    );
  }

  if (billingAvailable) {
    return (
      <div className="plan__cta-wrap">
        <button
          className="btn plan__cta"
          disabled={busy}
          onClick={() => go(() => startCheckout(plan))}
        >
          {busy ? "Starting…" : "Upgrade to Pro"}
        </button>
        <p className="plan__honest tertiary">
          Secure checkout by Stripe · cancel anytime
        </p>
        {error && <p className="plan__error">{error}</p>}
      </div>
    );
  }

  // Billing not configured yet — honest early-access capture.
  return <EarlyAccess />;
}

function EarlyAccess() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    try {
      await submitEarlyAccess(email);
      setState("done");
    } catch (err) {
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <p className="plan__done">
        You're on the list. We'll email you when Pro launches.
      </p>
    );
  }

  if (!open) {
    return (
      <div className="plan__cta-wrap">
        <button className="btn plan__cta" onClick={() => setOpen(true)}>
          Get early access
        </button>
        <p className="plan__honest tertiary">Launching soon · no payment now</p>
      </div>
    );
  }

  return (
    <form className="plan__form" onSubmit={submit}>
      <input
        className="input plan__email"
        type="email"
        required
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button className="btn plan__cta" disabled={state === "sending"}>
        {state === "sending" ? "Adding…" : "Notify me"}
      </button>
      {error && <p className="plan__error">{error}</p>}
      <p className="plan__honest tertiary">
        Pro is launching soon. No payment is taken now.
      </p>
    </form>
  );
}
