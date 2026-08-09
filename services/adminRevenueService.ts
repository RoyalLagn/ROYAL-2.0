import { Platform } from "react-native";
import { supabase } from "@/services/supabase";

export type EquityMember = {
  id?: string;
  name: string;
  equity_percentage: number;
  display_order?: number;
  updated_at?: string;
};

export type RevenuePayment = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  plan_name: string;
  amount: number;
  original_amount: number;
  discount_amount: number;
  currency: string;
  payment_status: string;
  payment_method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  paid_at: string | null;
  verified_at: string | null;
  created_at: string;
  revenue_date: string;
};

export type NewSubscription = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  plan_name: string;
  status: string;
  access_source: string;
  start_date: string | null;
  expiry_date: string | null;
  created_at: string;
};

export type RevenueDataset = {
  payments: RevenuePayment[];
  subscriptions: NewSubscription[];
};

function relatedName(value: unknown, key: "business_name" | "name", fallback: string) {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== "object") return fallback;
  return String((relation as Record<string, unknown>)[key] || fallback);
}

export const AdminRevenueService = {
  async listEquity(): Promise<EquityMember[]> {
    const { data, error } = await supabase
      .from("admin_equity_splits")
      .select("id,name,equity_percentage,display_order,updated_at")
      .order("display_order")
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      ...row,
      equity_percentage: Number(row.equity_percentage),
    })) as EquityMember[];
  },

  async saveEquity(members: EquityMember[]): Promise<EquityMember[]> {
    const payload = members.map((member) => ({
      name: member.name.trim(),
      equity_percentage: Number(member.equity_percentage),
    }));
    const { data, error } = await supabase.rpc("admin_save_equity_split", { members: payload });
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      equity_percentage: Number(row.equity_percentage),
      display_order: Number(row.display_order),
      updated_at: String(row.updated_at),
    }));
  },

  async load(startInclusive: Date, endExclusive: Date): Promise<RevenueDataset> {
    const start = startInclusive.toISOString();
    const end = endExclusive.toISOString();
    const [paymentRows, subscriptionRows] = await Promise.all([
      fetchAllRows((from, to) => supabase
        .from("subscription_payments")
        .select("id,vendor_id,amount,original_amount,discount_amount,currency,payment_status,payment_method,razorpay_order_id,razorpay_payment_id,paid_at,verified_at,created_at,vendors(business_name),subscription_plans(name)")
        .eq("payment_status", "verified")
        .gte("verified_at", start)
        .lt("verified_at", end)
        .order("verified_at", { ascending: true })
        .range(from, to)),
      fetchAllRows((from, to) => supabase
        .from("vendor_subscriptions")
        .select("id,vendor_id,status,access_source,start_date,expiry_date,created_at,vendors(business_name),subscription_plans!vendor_subscriptions_plan_id_fkey(name)")
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: true })
        .range(from, to)),
    ]);
    return {
      payments: paymentRows.map((row) => ({
        id: String(row.id), vendor_id: String(row.vendor_id),
        vendor_name: relatedName(row.vendors, "business_name", "Unknown vendor"),
        plan_name: relatedName(row.subscription_plans, "name", "Subscription plan"),
        amount: Number(row.amount), original_amount: Number(row.original_amount),
        discount_amount: Number(row.discount_amount), currency: String(row.currency || "INR"),
        payment_status: String(row.payment_status),
        payment_method: row.payment_method ? String(row.payment_method) : null,
        razorpay_order_id: row.razorpay_order_id ? String(row.razorpay_order_id) : null,
        razorpay_payment_id: row.razorpay_payment_id ? String(row.razorpay_payment_id) : null,
        paid_at: row.paid_at ? String(row.paid_at) : null,
        verified_at: row.verified_at ? String(row.verified_at) : null,
        created_at: String(row.created_at),
        revenue_date: String(row.verified_at),
      })),
      subscriptions: subscriptionRows.map((row) => ({
        id: String(row.id), vendor_id: String(row.vendor_id),
        vendor_name: relatedName(row.vendors, "business_name", "Unknown vendor"),
        plan_name: relatedName(row.subscription_plans, "name", "Subscription plan"),
        status: String(row.status), access_source: String(row.access_source),
        start_date: row.start_date ? String(row.start_date) : null,
        expiry_date: row.expiry_date ? String(row.expiry_date) : null,
        created_at: String(row.created_at),
      })),
    };
  },

  subscribe(onChange: () => void) {
    const channel = supabase.channel(`admin-revenue-${Date.now()}`);
    for (const table of ["admin_equity_splits", "subscription_payments", "vendor_subscriptions"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    }
    channel.subscribe();
    return () => { void channel.unsubscribe(); void supabase.removeChannel(channel); };
  },

  downloadExcel(input: {
    periodLabel: string;
    start: Date;
    endExclusive: Date;
    payments: RevenuePayment[];
    subscriptions: NewSubscription[];
    equity: EquityMember[];
  }) {
    if (Platform.OS !== "web" || typeof document === "undefined") {
      throw new Error("Excel report download is available in the web Admin Panel.");
    }
    const revenue = input.payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalEquity = input.equity.reduce((sum, member) => sum + member.equity_percentage, 0);
    const sheets = [
      sheet("Summary", [
        ["RoyalLagn Subscription Revenue Report"], ["Period", input.periodLabel],
        ["From", input.start.toISOString()], ["To", input.endExclusive.toISOString()],
        ["Verified Revenue", revenue], ["Verified Payments", input.payments.length],
        ["New Subscriptions", input.subscriptions.length], ["Total Equity %", totalEquity],
      ]),
      sheet("Income Distribution", [
        ["Name", "Equity Percentage", "Calculated Income"],
        ...input.equity.map((member) => [member.name, member.equity_percentage, totalEquity === 100 ? revenue * member.equity_percentage / 100 : "Invalid split"]),
      ]),
      sheet("Payment Details", [
        ["Payment ID", "Vendor", "Plan", "Amount", "Original Amount", "Discount", "Currency", "Method", "Razorpay Order ID", "Razorpay Payment ID", "Revenue Date"],
        ...input.payments.map((payment) => [payment.id, payment.vendor_name, payment.plan_name, payment.amount, payment.original_amount, payment.discount_amount, payment.currency, payment.payment_method || "", payment.razorpay_order_id || "", payment.razorpay_payment_id || "", payment.revenue_date]),
      ]),
      sheet("New Subscriptions", [
        ["Subscription ID", "Vendor", "Plan", "Status", "Access Source", "Start Date", "Expiry Date", "Created At"],
        ...input.subscriptions.map((subscription) => [subscription.id, subscription.vendor_name, subscription.plan_name, subscription.status, subscription.access_source, subscription.start_date || "", subscription.expiry_date || "", subscription.created_at]),
      ]),
    ];
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets.join("")}</Workbook>`;
    const url = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `royallagn-revenue-${input.start.toISOString().slice(0, 10)}-${new Date(input.endExclusive.getTime() - 1).toISOString().slice(0, 10)}.xls`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  },
};

async function fetchAllRows(request: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>) {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await request(from, from + pageSize - 1);
    if (error) throw new Error(error.message || "Unable to load revenue records.");
    const page = (data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function escapeXml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sheet(name: string, rows: unknown[][]) {
  const content = rows.map((row) => `<Row>${row.map((value) => {
    const numeric = typeof value === "number" && Number.isFinite(value);
    return `<Cell><Data ss:Type="${numeric ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;
  }).join("")}</Row>`).join("");
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${content}</Table></Worksheet>`;
}
