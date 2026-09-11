import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clips Business Plan — Shaaadi Vendors Plans & Profit Calculator" },
      {
        name: "description",
        content:
          "Vendor plan pricing, Bunny.net cost model and a live profit calculator for the Clips feature in the Shaaadi Vendors app.",
      },
      { property: "og:title", content: "Clips Business Plan — Shaaadi Vendors" },
      {
        property: "og:description",
        content:
          "Free, Premium ₹499 and Elite ₹999 vendor plans, media cost model and an interactive net-profit calculator.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

/* ---------------- Prebuilt plan constants ---------------- */

const PLANS = [
  {
    key: "free",
    name: "Free",
    price: 0,
    images: 5,
    imgUpload: "< 8 MB / image",
    imgStored: 4,
    clips: 0,
    clipUpload: "—",
    clipStored: 0,
    tone: "from-brand-blue/12 to-brand-blue/0",
  },
  {
    key: "premium",
    name: "Premium",
    price: 499,
    images: 40,
    imgUpload: "< 12 MB / image",
    imgStored: 6,
    clips: 0,
    clipUpload: "—",
    clipStored: 0,
    tone: "from-brand-purple/12 to-brand-purple/0",
  },
  {
    key: "elite",
    name: "Elite",
    price: 999,
    images: 60,
    imgUpload: "< 20 MB / image",
    imgStored: 12,
    clips: 20,
    clipUpload: "< 40 MB / clip",
    clipStored: 20,
    tone: "from-brand-pink/14 to-brand-orange/0",
  },
] as const;

const CLIPS_PER_USER_PER_DAY = 30;
const DAYS = 30;
const DELIVERED_MB_PER_VIEW = 4;
const USD_INR = 88;
const STORAGE_USD_PER_GB = 0.01;

const NAV = [
  { href: "#plan", label: "The Plan" },
  { href: "#plans", label: "Plans" },
  { href: "#clips", label: "Why Clips" },
  { href: "#calculator", label: "Calculator" },
];

const inr = (n: number) =>
  "₹" + Math.round(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Index() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main>
        <Hero />
        <PlanExplanation />
        <PlansTable />
        <WhyClips />
        <Calculator />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-12 pt-6 text-center text-xs text-muted-foreground">
        Estimates only. Actual Bunny.net billing varies by network, region and real usage.
      </footer>
    </div>
  );
}

/* ---------------- Chrome ---------------- */

function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 px-3 pt-3">
      <nav className="glass mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-3">
        <a href="#top" className="flex items-center gap-2">
          <span className="gradient-surface grid size-8 place-items-center rounded-xl text-sm font-bold">
            C
          </span>
          <span className="text-sm font-extrabold tracking-tight">
            Clips <span className="gradient-text">Business Plan</span>
          </span>
        </a>
        <div className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className="rounded-full px-3 py-2 text-sm font-semibold text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
            >
              {n.label}
            </a>
          ))}
          <a
            href="#calculator"
            className="gradient-surface ml-2 rounded-full px-4 py-2 text-sm font-bold shadow-[var(--shadow-soft)]"
          >
            Run numbers
          </a>
        </div>
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((v) => !v)}
          className="glass-soft rounded-xl px-3 py-2 text-sm font-bold md:hidden"
        >
          {open ? "✕" : "☰"}
        </button>
      </nav>
      {open && (
        <div className="glass mx-auto mt-2 flex max-w-6xl flex-col rounded-2xl p-2 md:hidden">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold"
            >
              {n.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="mx-auto max-w-6xl px-4 pb-8 pt-14 text-center">
      <span className="glass-soft inline-flex rounded-full px-4 py-1.5 text-xs font-bold tracking-wide">
        Shaaadi Vendors · Media &amp; Clips Strategy
      </span>
      <h1 className="mx-auto mt-5 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-6xl">
        Premium Clips, <span className="gradient-text">predictable costs.</span>
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-base text-foreground/70 sm:text-lg">
        Fixed vendor subscriptions on one side, tightly capped video bandwidth on the other. Here is
        the full plan — and a calculator to prove the margin at any scale.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          ["₹499 / ₹999", "Premium & Elite monthly plans"],
          ["30 clips / user / day", "Hard cap on consumption"],
          ["~4 MB per view", "Optimised streaming delivery"],
        ].map(([a, b]) => (
          <div key={a} className="glass rounded-3xl p-5 text-left">
            <div className="text-xl font-extrabold">{a}</div>
            <div className="mt-1 text-sm text-foreground/60">{b}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="mb-8 max-w-2xl">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/50">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-3 text-foreground/70">{sub}</p>}
    </div>
  );
}

/* ---------------- Plan explanation ---------------- */

function PlanExplanation() {
  const points = [
    {
      t: "Clips stay Elite-only",
      d: "The most expensive media feature sits behind the highest plan, so bandwidth is paid for before it is consumed.",
    },
    {
      t: "Vendor revenue is fixed",
      d: "Subscriptions are monthly and predictable — 10 Premium + 5 Elite already means ₹9,985 every month.",
    },
    {
      t: "Consumption is capped",
      d: "Every user can watch at most 30 clips a day. That single rule puts a hard ceiling on the bandwidth bill.",
    },
    {
      t: "Delivery is optimised",
      d: "Uploads up to 40 MB are transcoded down to roughly 4 MB delivered per view — a 5x cost reduction.",
    },
    {
      t: "Storage is allowance-based",
      d: "Fixed image and clip counts per plan mean storage grows linearly with paying vendors, never wildly.",
    },
    {
      t: "Costs are measurable",
      d: "Bunny.net bills per GB delivered and stored, so every rupee of cost maps to a known user action.",
    },
  ];
  return (
    <section id="plan" className="mx-auto max-w-6xl px-4 py-16">
      <SectionHead
        eyebrow="01 · The Plan"
        title="How the model protects the business"
        sub="Clips are a conversion and engagement feature, not an unlimited media service. Six rules keep revenue fixed and cost variable-but-bounded."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((p, i) => (
          <article key={p.t} className="glass gradient-ring rounded-3xl p-6">
            <div className="gradient-text text-sm font-extrabold">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="mt-2 text-lg font-bold">{p.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">{p.d}</p>
          </article>
        ))}
      </div>

      <div className="glass mt-6 grid gap-4 rounded-3xl p-6 sm:grid-cols-3">
        {[
          ["Upload → validate", "Size limits enforced per plan before anything reaches storage."],
          ["Compress → transcode", "Images resized, clips transcoded to adaptive streaming renditions."],
          ["Serve → meter", "Bunny CDN delivers; the 30/day view limit is enforced in the app."],
        ].map(([t, d]) => (
          <div key={t}>
            <div className="font-bold">{t}</div>
            <p className="mt-1 text-sm text-foreground/70">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Plans table ---------------- */

function PlansTable() {
  const rows: [string, (p: (typeof PLANS)[number]) => string][] = [
    ["Price / month", (p) => (p.price === 0 ? "₹0" : inr(p.price))],
    ["Images", (p) => String(p.images)],
    ["Image upload limit", (p) => p.imgUpload],
    ["Stored image target", (p) => `≤ ${p.imgStored} MB / image`],
    ["Clips", (p) => (p.clips === 0 ? "None" : String(p.clips))],
    ["Clip upload limit", (p) => p.clipUpload],
    ["Stored clip target", (p) => (p.clipStored ? `≤ ${p.clipStored} MB / clip` : "—")],
    ["Avg delivered per view", (p) => (p.clips ? `~${DELIVERED_MB_PER_VIEW} MB` : "—")],
  ];

  return (
    <section id="plans" className="mx-auto max-w-6xl px-4 py-16">
      <SectionHead
        eyebrow="02 · Plans"
        title="Vendor plans at a glance"
        sub="Three tiers. Images for everyone, Clips reserved for Elite."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <div
            key={p.key}
            className={`glass gradient-ring rounded-3xl bg-gradient-to-b ${p.tone} p-6`}
          >
            <div className="flex items-baseline justify-between">
              <h3 className="text-xl font-extrabold">{p.name}</h3>
              {p.key === "elite" && (
                <span className="gradient-surface rounded-full px-3 py-1 text-[11px] font-bold">
                  Clips included
                </span>
              )}
            </div>
            <div className="mt-3 text-4xl font-extrabold tracking-tight">
              {p.price === 0 ? "₹0" : inr(p.price)}
              <span className="text-base font-semibold text-foreground/50"> /mo</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              <li className="font-semibold">{p.images} images · {p.imgUpload}</li>
              <li className="text-foreground/70">Stored ≤ {p.imgStored} MB per image</li>
              <li className="font-semibold">
                {p.clips ? `${p.clips} clips · ${p.clipUpload}` : "No clips"}
              </li>
              <li className="text-foreground/70">
                {p.clipStored ? `Stored ≤ ${p.clipStored} MB per clip` : "Images only tier"}
              </li>
            </ul>
          </div>
        ))}
      </div>

      <div className="glass mt-6 overflow-x-auto rounded-3xl p-2">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-4 text-left font-bold">Specification</th>
              {PLANS.map((p) => (
                <th key={p.key} className="p-4 text-left font-bold">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get]) => (
              <tr key={label} className="border-t">
                <td className="p-4 font-semibold text-foreground/70">{label}</td>
                {PLANS.map((p) => (
                  <td key={p.key} className="p-4 font-semibold">
                    {get(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Why clips ---------------- */

function WhyClips() {
  const cards = [
    {
      t: "Trust before the first call",
      d: "A couple can see a decorator's real setup, a caterer's live counter, a photographer's motion — far more convincing than stills.",
    },
    {
      t: "The strongest upsell lever",
      d: "Clips are the single reason a vendor moves from ₹499 Premium to ₹999 Elite. One feature, double the ARPU.",
    },
    {
      t: "Time spent in app",
      d: "A vertical clips feed keeps users scrolling daily instead of visiting once. More sessions, more enquiries.",
    },
    {
      t: "Higher enquiry quality",
      d: "Users who watch before contacting arrive pre-sold, which vendors feel directly as better conversion.",
    },
    {
      t: "Defensible against rivals",
      d: "Static listing directories cannot match a moving portfolio; clips make Shaaadi Vendors the default place to browse.",
    },
    {
      t: "Cheap at the margin",
      d: "At ~4 MB per view the infrastructure cost of the feature stays a small fraction of the Elite revenue it unlocks.",
    },
  ];
  return (
    <section id="clips" className="mx-auto max-w-6xl px-4 py-16">
      <SectionHead
        eyebrow="03 · Why Clips"
        title="Why Clips matter in the Shaaadi Vendors app"
        sub="Clips are the feature that turns a listing directory into a place people open every day."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.t} className="glass-soft rounded-3xl p-6">
            <h3 className="text-lg font-bold">{c.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-foreground/70">{c.d}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Calculator ---------------- */

function Field({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wide text-foreground/60">{label}</span>
      <div className="glass-soft mt-1.5 flex items-center rounded-2xl px-4 py-2.5">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent text-base font-bold outline-none"
        />
        {suffix && <span className="pl-2 text-sm font-semibold text-foreground/50">{suffix}</span>}
      </div>
      {hint && <span className="mt-1 block text-[11px] text-foreground/50">{hint}</span>}
    </label>
  );
}

function Row({
  label,
  value,
  strong,
  negative,
  total,
}: {
  label: string;
  value: string;
  strong?: boolean;
  negative?: boolean;
  total?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-3 ${
        total ? "border-t-2 border-foreground/15" : "border-t"
      }`}
    >
      <span className={`text-sm ${strong ? "font-extrabold" : "font-semibold text-foreground/70"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${strong ? "text-lg font-extrabold" : "font-bold"} ${
          negative ? "text-destructive" : ""
        }`}
      >
        {negative ? "− " : ""}
        {value}
      </span>
    </div>
  );
}

function Calculator() {
  const [vendors, setVendors] = useState("100");
  const [pctFree, setPctFree] = useState("60");
  const [pctPrem, setPctPrem] = useState("30");
  const [pctElite, setPctElite] = useState("10");
  const [users, setUsers] = useState("2000");
  const [expenses, setExpenses] = useState("");
  const [taxPct, setTaxPct] = useState("32.5");
  const [rate, setRate] = useState<"volume" | "asia">("volume");
  const [onSeasonMonths, setOnSeasonMonths] = useState("9");
  const [offSeasonPct, setOffSeasonPct] = useState("40");

  const n = (s: string) => (s.trim() === "" ? 0 : Math.max(0, Number(s) || 0));

  const r = useMemo(() => {
    const total = n(vendors);
    const free = Math.round((total * n(pctFree)) / 100);
    const prem = Math.round((total * n(pctPrem)) / 100);
    const elite = Math.round((total * n(pctElite)) / 100);

    const revenue = prem * 499 + elite * 999;

    const views = n(users) * CLIPS_PER_USER_PER_DAY * DAYS;
    const bandwidthGB = (views * DELIVERED_MB_PER_VIEW) / 1024;
    const bwRate = rate === "volume" ? 0.005 : 0.03;
    const bandwidthUsd = bandwidthGB * bwRate;

    const storageGB =
      (free * 5 * 4 + prem * 40 * 6 + elite * 60 * 12 + elite * 20 * 20) / 1024;
    const storageUsd = storageGB * STORAGE_USD_PER_GB;

    const directCost = (bandwidthUsd + storageUsd) * USD_INR;
    const grossProfit = revenue - directCost;
    const opex = n(expenses);
    const pbt = grossProfit - opex;
    const tax = pbt > 0 ? (pbt * n(taxPct)) / 100 : 0;
    const net = pbt - tax;

    const onMonths = Math.max(0, Math.min(12, n(onSeasonMonths)));
    const offMonths = 12 - onMonths;
    const offMultiplier = n(offSeasonPct) / 100;
    const annualNet = net * onMonths + net * offMultiplier * offMonths;
    const annualTax = tax * onMonths + tax * offMultiplier * offMonths;

    return {
      free,
      prem,
      elite,
      revenue,
      views,
      bandwidthGB,
      storageGB,
      bandwidthInr: bandwidthUsd * USD_INR,
      storageInr: storageUsd * USD_INR,
      directCost,
      grossProfit,
      opex,
      pbt,
      tax,
      net,
      pctSum: n(pctFree) + n(pctPrem) + n(pctElite),
      onMonths,
      offMonths,
      offMultiplier,
      annualNet,
      annualTax,
    };
  }, [vendors, pctFree, pctPrem, pctElite, users, expenses, taxPct, rate, onSeasonMonths, offSeasonPct]);

  return (
    <section id="calculator" className="mx-auto max-w-6xl px-4 py-16">
      <SectionHead
        eyebrow="04 · Calculator"
        title="Profitability calculator"
        sub="Enter vendor mix and monthly viewers. Plan limits and Bunny.net rates are fixed as per the business plan."
      />

      <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        {/* Inputs */}
        <div className="glass rounded-3xl p-6">
          <h3 className="text-lg font-extrabold">Your inputs</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Total vendors" value={vendors} onChange={setVendors} />
            <Field
              label="Users watching clips / month"
              value={users}
              onChange={setUsers}
              hint="Each user capped at 30 clips/day"
            />
            <Field label="Free vendors" value={pctFree} onChange={setPctFree} suffix="%" />
            <Field label="Premium vendors" value={pctPrem} onChange={setPctPrem} suffix="%" />
            <Field label="Elite vendors" value={pctElite} onChange={setPctElite} suffix="%" />
            <Field
              label="Operating expenses (optional)"
              value={expenses}
              onChange={setExpenses}
              suffix="₹/mo"
              hint="Salaries, marketing, rent, gateway fees, software"
            />
            <Field label="Income tax rate" value={taxPct} onChange={setTaxPct} suffix="%" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wide text-foreground/60">
                Bunny bandwidth network
              </span>
              <div className="glass-soft mt-1.5 flex gap-1 rounded-2xl p-1">
                {[
                  ["volume", "Volume $0.005/GB"],
                  ["asia", "Asia $0.03/GB"],
                ].map(([k, l]) => (
                  <button
                    key={k}
                    onClick={() => setRate(k as "volume" | "asia")}
                    className={`flex-1 rounded-xl px-2 py-2 text-xs font-bold transition ${
                      rate === k ? "gradient-surface" : "text-foreground/60"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {r.pctSum !== 100 && (
            <p className="mt-4 rounded-2xl bg-destructive/10 px-4 py-2.5 text-xs font-bold text-destructive">
              Plan percentages add up to {r.pctSum}% — adjust to 100% for an accurate mix.
            </p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            {[
              ["Free", r.free],
              ["Premium", r.prem],
              ["Elite", r.elite],
            ].map(([l, v]) => (
              <div key={l as string} className="glass-soft rounded-2xl p-3">
                <div className="text-xl font-extrabold">{v as number}</div>
                <div className="text-[11px] font-semibold text-foreground/60">{l as string}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Fixed values */}
        <div className="glass rounded-3xl p-6">
          <h3 className="text-lg font-extrabold">Fixed plan values</h3>
          <p className="mt-1 text-xs text-foreground/60">
            Not editable — locked from the business plan.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-xs">
              <thead>
                <tr className="text-foreground/60">
                  <th className="py-2 font-bold">Item</th>
                  {PLANS.map((p) => (
                    <th key={p.key} className="py-2 font-bold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="font-semibold">
                {[
                  ["Price", PLANS.map((p) => (p.price ? inr(p.price) : "₹0"))],
                  ["Images", PLANS.map((p) => String(p.images))],
                  ["Image upload", PLANS.map((p) => p.imgUpload.replace(" / image", ""))],
                  ["Image stored", PLANS.map((p) => `≤ ${p.imgStored} MB`)],
                  ["Clips", PLANS.map((p) => (p.clips ? String(p.clips) : "—"))],
                  [
                    "Clip upload",
                    PLANS.map((p) => (p.clipUpload === "—" ? "—" : p.clipUpload.replace(" / clip", ""))),
                  ],
                  ["Clip stored", PLANS.map((p) => (p.clipStored ? `≤ ${p.clipStored} MB` : "—"))],
                ].map(([label, vals]) => (
                  <tr key={label as string} className="border-t">
                    <td className="py-2 pr-2 text-foreground/60">{label as string}</td>
                    {(vals as string[]).map((v, i) => (
                      <td key={i} className="py-2 pr-2">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs font-semibold">
            {[
              ["Clips / user / day", "30"],
              ["Days per month", "30"],
              ["Delivered per view", "~4 MB"],
              ["USD → INR", "₹88"],
              ["Storage rate", "$0.01 / GB"],
              ["Streaming compression", "40 MB → ~4 MB"],
            ].map(([a, b]) => (
              <div key={a} className="glass-soft flex justify-between rounded-2xl px-3 py-2">
                <span className="text-foreground/60">{a}</span>
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Usage */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ["Max clip views / month", r.views.toLocaleString("en-IN")],
          ["Video bandwidth", `${r.bandwidthGB.toFixed(1)} GB`],
          ["Stored media", `${r.storageGB.toFixed(2)} GB`],
        ].map(([a, b]) => (
          <div key={a} className="glass-soft rounded-3xl p-5">
            <div className="text-sm font-semibold text-foreground/60">{a}</div>
            <div className="mt-1 text-2xl font-extrabold">{b}</div>
          </div>
        ))}
      </div>

      {/* Results */}
      <div className="glass gradient-ring mt-4 rounded-3xl p-6">
        <h3 className="text-lg font-extrabold">Results</h3>
        <div className="mt-2">
          <Row label="Gross Revenue (Total Inflow / Sales)" value={inr(r.revenue)} strong />
          <Row
            label={`Direct Operational Costs (Bunny.net storage ${inr(r.storageInr)} + streaming ${inr(r.bandwidthInr)})`}
            value={inr(r.directCost)}
            negative
          />
          <Row label="Gross Profit" value={inr(r.grossProfit)} strong total />
          <Row label="Operating Expenses (salaries, marketing, rent, gateway, software)" value={inr(r.opex)} negative />
          <Row label="Net Profit Before Tax (taxable business income)" value={inr(r.pbt)} strong total />
          <Row label={`Income Tax (${n(taxPct)}%)`} value={inr(r.tax)} negative />
        </div>
        <div className="gradient-surface mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-4">
          <span className="text-sm font-extrabold uppercase tracking-wide">
            Net Revenue (Net Profit After Tax)
          </span>
          <span className="text-3xl font-extrabold tabular-nums">{inr(r.net)}</span>
        </div>
      </div>

      {/* Yearly calculation */}
      <div className="glass gradient-ring mt-4 rounded-3xl p-6">
        <h3 className="text-lg font-extrabold">Annual projection</h3>
        <p className="mt-1 text-sm text-foreground/60">
          On-season uses the monthly net revenue above. Off-season is estimated as a percentage of
          on-season.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field
            label="On-season months"
            value={onSeasonMonths}
            onChange={setOnSeasonMonths}
            hint="Off-season auto = 12 − this"
          />
          <div>
            <span className="text-xs font-bold uppercase tracking-wide text-foreground/60">
              Off-season months
            </span>
            <div className="glass-soft mt-1.5 flex items-center rounded-2xl px-4 py-2.5">
              <span className="text-base font-bold">{r.offMonths}</span>
            </div>
            <span className="mt-1 block text-[11px] text-foreground/50">Auto = 12 − on-season</span>
          </div>
          <Field
            label="Off-season earning vs on-season"
            value={offSeasonPct}
            onChange={setOffSeasonPct}
            suffix="%"
            hint="Off-season net revenue as % of on-season"
          />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            ["On-season net revenue", inr(r.net * r.onMonths)],
            ["Off-season net revenue", inr(r.net * r.offMultiplier * r.offMonths)],
            ["Annual Net Revenue / Profit", inr(r.annualNet)],
          ].map(([label, value]) => (
            <div key={label} className="glass-soft rounded-2xl p-4 text-center">
              <div className="text-xs font-semibold text-foreground/60">{label}</div>
              <div className="mt-1 text-xl font-extrabold tabular-nums">{value}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-destructive/10 px-5 py-3">
          <span className="text-sm font-extrabold text-destructive">Total tax per year</span>
          <span className="text-xl font-extrabold tabular-nums text-destructive">
            {inr(r.annualTax)}
          </span>
        </div>
      </div>
    </section>
  );
}
