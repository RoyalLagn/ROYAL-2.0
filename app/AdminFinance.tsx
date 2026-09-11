import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown } from "lucide-react-native";
import AdminFooter from "@/components/AdminFooter";
import { AdminClipFinanceService } from "@/services/adminClipFinanceService";
import type { ClipFinanceMonthlyInputs, ClipFinanceMonthlyResults, ClipFinanceMonthlySnapshot } from "@/types/adminClipFinance";

const INK = "#151521", MUTED = "#696A75", LINE = "rgba(113,91,180,.16)", RED = "#E82936";
const PLANS = [
  { key: "free", name: "Free", price: 0, images: 5, upload: "< 8 MB", stored: "≤ 4 MB", clips: "—", clipUpload: "—", clipStored: "—" },
  { key: "premium", name: "Premium", price: 499, images: 40, upload: "< 12 MB", stored: "≤ 6 MB", clips: "—", clipUpload: "—", clipStored: "—" },
  { key: "elite", name: "Elite", price: 999, images: 60, upload: "< 20 MB", stored: "≤ 12 MB", clips: "20", clipUpload: "< 40 MB", clipStored: "≤ 20 MB" },
] as const;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const n = (value: string) => value.trim() === "" ? 0 : Math.max(0, Number(value) || 0);
const CURRENT_DATE = new Date();
const CURRENT_MONTH = `${CURRENT_DATE.getFullYear()}-${String(CURRENT_DATE.getMonth() + 1).padStart(2, "0")}-01`;
const CURRENT_YEAR_START = `${CURRENT_DATE.getFullYear()}-01-01`;
const monthLabel = (month: string) => new Date(`${month}T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
const previousMonthsThisYear = () => Array.from({ length: CURRENT_DATE.getMonth() }, (_, index) => {
  const month = CURRENT_DATE.getMonth() - index;
  return `${CURRENT_DATE.getFullYear()}-${String(month).padStart(2, "0")}-01`;
});

export default function AdminFinance() {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const [vendors, setVendors] = useState("100"), [users, setUsers] = useState("2000");
  const [freePct, setFreePct] = useState("60"), [premiumPct, setPremiumPct] = useState("30"), [elitePct, setElitePct] = useState("10");
  const [expenses, setExpenses] = useState(""), [taxPct, setTaxPct] = useState("32.5");
  const [network, setNetwork] = useState<"volume" | "asia">("volume");
  const [onMonths, setOnMonths] = useState("9"), [offPct, setOffPct] = useState("40");
  const [menuOpen, setMenuOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<ClipFinanceMonthlySnapshot[]>([]);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyBackendAvailable, setHistoryBackendAvailable] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const r = useMemo(() => {
    const total = n(vendors), free = Math.round(total * n(freePct) / 100), premium = Math.round(total * n(premiumPct) / 100), elite = Math.round(total * n(elitePct) / 100);
    const revenue = premium * 499 + elite * 999, views = n(users) * 30 * 30, bandwidthGB = views * 4 / 1024;
    const bandwidthInr = bandwidthGB * (network === "volume" ? .005 : .03) * 88;
    const storageGB = (free * 5 * 4 + premium * 40 * 6 + elite * 60 * 12 + elite * 20 * 20) / 1024;
    const storageInr = storageGB * .01 * 88, directCost = bandwidthInr + storageInr, gross = revenue - directCost;
    const operatingExpenses = n(expenses), pbt = gross - operatingExpenses, tax = pbt > 0 ? pbt * n(taxPct) / 100 : 0, net = pbt - tax;
    const on = Math.min(12, n(onMonths)), off = 12 - on, mult = n(offPct) / 100;
    const annualFactor = on + mult * off;
    const annualRevenue = revenue * annualFactor;
    const annualStorageInr = storageInr * 12;
    const annualBandwidthInr = bandwidthInr * annualFactor;
    const annualDirectCost = annualStorageInr + annualBandwidthInr;
    const annualGross = annualRevenue - annualDirectCost;
    const annualExpenses = n(expenses) * 12;
    const annualPbt = annualGross - annualExpenses;
    const annualTax = annualPbt > 0 ? annualPbt * n(taxPct) / 100 : 0;
    const annualNet = annualPbt - annualTax;
    const onSeasonNet = net * on;
    const offSeasonNet = annualNet - onSeasonNet;
    return {
      free, premium, elite, revenue, views, bandwidthGB, bandwidthInr, storageGB, storageInr, directCost, gross, operatingExpenses, pbt, tax, net, on, off, mult,
      annualRevenue, annualStorageInr, annualBandwidthInr, annualDirectCost,
      annualGross, annualExpenses, annualPbt, annualNet, annualTax, onSeasonNet, offSeasonNet,
      pctSum: n(freePct) + n(premiumPct) + n(elitePct),
    };
  }, [elitePct, expenses, freePct, network, offPct, onMonths, premiumPct, taxPct, users, vendors]);
  const currentInputs = useMemo<ClipFinanceMonthlyInputs>(() => ({
    totalVendors: n(vendors), monthlyClipViewers: n(users), freePercent: n(freePct), premiumPercent: n(premiumPct), elitePercent: n(elitePct),
    monthlyOperatingExpenses: n(expenses), incomeTaxPercent: n(taxPct), bandwidthNetwork: network,
    onSeasonMonths: Math.min(12, n(onMonths)), offSeasonPercent: n(offPct),
  }), [elitePct, expenses, freePct, network, offPct, onMonths, premiumPct, taxPct, users, vendors]);
  const currentResults = useMemo<ClipFinanceMonthlyResults>(() => ({
    grossRevenue: r.revenue, storageCost: r.storageInr, streamingCost: r.bandwidthInr,
    directOperationalCost: r.directCost, grossProfit: r.gross, operatingExpenses: r.operatingExpenses,
    profitBeforeTax: r.pbt, incomeTax: r.tax, netRevenue: r.net,
  }), [r]);
  const previousMonths = useMemo(previousMonthsThisYear, []);
  const snapshotByMonth = useMemo(() => new Map(snapshots.map((snapshot) => [snapshot.month_start, snapshot])), [snapshots]);
  const loadSnapshots = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const loaded = await AdminClipFinanceService.loadYearSnapshots(CURRENT_YEAR_START, CURRENT_MONTH);
      setSnapshots(loaded);
      setHistoryBackendAvailable(true);
      const current = loaded.find((snapshot) => snapshot.month_start === CURRENT_MONTH);
      if (current) {
        setVendors(String(current.inputs.totalVendors)); setUsers(String(current.inputs.monthlyClipViewers));
        setFreePct(String(current.inputs.freePercent)); setPremiumPct(String(current.inputs.premiumPercent)); setElitePct(String(current.inputs.elitePercent));
        setExpenses(String(current.inputs.monthlyOperatingExpenses)); setTaxPct(String(current.inputs.incomeTaxPercent));
        setNetwork(current.inputs.bandwidthNetwork); setOnMonths(String(current.inputs.onSeasonMonths)); setOffPct(String(current.inputs.offSeasonPercent));
      }
    } catch {
      setHistoryBackendAvailable(false);
      setHistoryError("Monthly history could not be loaded. Apply the latest finance database migration, then try again.");
    } finally {
      setHistoryReady(true);
      setHistoryLoading(false);
    }
  }, []);
  useEffect(() => { void loadSnapshots(); }, [loadSnapshots]);
  useEffect(() => {
    if (!historyReady || !historyBackendAvailable || r.pctSum !== 100) return;
    setSaveState("saving");
    const timeout = setTimeout(() => {
      void AdminClipFinanceService.saveMonthlySnapshot({ month_start: CURRENT_MONTH, inputs: currentInputs, results: currentResults })
        .then((saved) => {
          setSnapshots((existing) => [saved, ...existing.filter((snapshot) => snapshot.month_start !== saved.month_start)]);
          setSaveState("saved");
          setHistoryError(null);
        })
        .catch(() => {
          setSaveState("idle");
          setHistoryError("This month's results could not be saved. Check the connection and try again.");
        });
    }, 700);
    return () => clearTimeout(timeout);
  }, [currentInputs, currentResults, historyBackendAvailable, historyReady, r.pctSum]);
  const go = (key: string) => scroll.current?.scrollTo({ y: positions.current[key] ?? 0, animated: true });
  const mark = (key: string) => ({ onLayout: (e: any) => { positions.current[key] = e.nativeEvent.layout.y; } });
  return <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
    <View style={s.blueGlow} /><View style={s.pinkGlow} /><View style={s.orangeGlow} />
    <ScrollView ref={scroll} stickyHeaderIndices={[0]} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
      <View style={s.navWrap}><Glass style={s.nav}><Pressable onPress={() => go("top")} style={s.brand}><Gradient style={s.logo}><Text style={s.logoText}>C</Text></Gradient><Text style={s.brandText}>Clips <Text style={s.purple}>Business Plan</Text></Text></Pressable>{desktop ? <View style={s.navLinks}>{[["plans","Plans"],["calculator","Calculator"]].map(([k,l]) => <Pressable key={k} onPress={() => go(k)} style={s.navButton}><Text style={s.navText}>{l}</Text></Pressable>)}<Pressable onPress={() => go("calculator")}><Gradient style={s.run}><Text style={s.runText}>Run numbers</Text></Gradient></Pressable></View> : <Pressable accessibilityLabel="Toggle menu" onPress={() => setMenuOpen(v => !v)} style={[s.glassSoft,s.menuButton]}><Text style={s.menuText}>{menuOpen ? "✕" : "☰"}</Text></Pressable>}</Glass>{!desktop && menuOpen ? <Glass style={s.mobileMenu}>{[["plans","Plans"],["calculator","Calculator"]].map(([k,l]) => <Pressable key={k} onPress={() => { setMenuOpen(false); go(k); }} style={s.mobileLink}><Text style={s.navText}>{l}</Text></Pressable>)}</Glass> : null}</View>
      <View {...mark("top")} style={s.hero}><Glass soft style={s.pill}><Text style={s.eyebrow}>Shaaadi Vendors · Media & Clips Strategy</Text></Glass><Text style={[s.heroTitle,!desktop&&s.heroTitleMobile]}>Premium Clips, <Text style={s.purple}>predictable costs.</Text></Text><Text style={[s.heroCopy,!desktop&&s.heroCopyMobile]}>Fixed vendor subscriptions on one side, tightly capped video bandwidth on the other. Here is the full plan — and a calculator to prove the margin at any scale.</Text><View style={s.three}>{[["₹499 / ₹999","Premium & Elite monthly plans"],["30 clips / user / day","Hard cap on consumption"],["~4 MB per view","Optimised streaming delivery"]].map(([a,b]) => <Glass key={a} style={s.stat}><Text style={s.statValue}>{a}</Text><Text style={s.copy}>{b}</Text></Glass>)}</View></View>
      <Section marker={mark("plans")} eyebrow="02 · PLANS" title="Vendor plans at a glance" sub="Three tiers. Images for everyone, Clips reserved for Elite."><View style={s.three}>{PLANS.map(p => <Glass key={p.key} style={s.plan}><View style={s.planHead}><Text style={s.planName}>{p.name}</Text>{p.key === "elite" ? <Gradient style={s.badge}><Text style={s.badgeText}>Clips included</Text></Gradient> : null}</View><Text style={s.price}>{money(p.price)}<Text style={s.per}> /mo</Text></Text><Text style={s.planLine}>{p.images} images · {p.upload} / image</Text><Text style={s.copy}>Stored {p.stored} per image</Text><Text style={s.planLine}>{p.clips === "—" ? "No clips" : `${p.clips} clips · ${p.clipUpload} / clip`}</Text><Text style={s.copy}>{p.clips === "—" ? "Images only tier" : `Stored ${p.clipStored} per clip`}</Text></Glass>)}</View><Glass style={s.table}><Table header="Specification" rows={[["Price / month","₹0","₹499","₹999"],["Images","5","40","60"],["Image upload limit","< 8 MB / image","< 12 MB / image","< 20 MB / image"],["Stored image target","≤ 4 MB / image","≤ 6 MB / image","≤ 12 MB / image"],["Clips","None","None","20"],["Clip upload limit","—","—","< 40 MB / clip"],["Stored clip target","—","—","≤ 20 MB / clip"],["Avg delivered per view","—","—","~4 MB"]]} /></Glass></Section>
      <Section marker={mark("calculator")} eyebrow="04 · CALCULATOR" title="Profitability calculator" sub="Enter vendor mix and monthly viewers. Plan limits and Bunny.net rates are fixed as per the business plan.">
        <View style={[s.calcGrid, desktop && s.calcGridDesktop]}><Glass style={s.calc}><Text style={s.panelTitle}>Your inputs</Text><View style={s.fields}><Field label="TOTAL VENDORS" value={vendors} set={setVendors}/><Field label="USERS WATCHING CLIPS / MONTH" value={users} set={setUsers} hint="Each user capped at 30 clips/day"/><Field label="FREE VENDORS" value={freePct} set={setFreePct} suffix="%"/><Field label="PREMIUM VENDORS" value={premiumPct} set={setPremiumPct} suffix="%"/><Field label="ELITE VENDORS" value={elitePct} set={setElitePct} suffix="%"/><Field label="OPERATING EXPENSES (OPTIONAL)" value={expenses} set={setExpenses} suffix="₹/mo" hint="Salaries, marketing, rent, gateway fees, software"/><Field label="INCOME TAX RATE" value={taxPct} set={setTaxPct} suffix="%"/><View style={s.field}><Text style={s.label}>BUNNY BANDWIDTH NETWORK</Text><Glass soft style={s.segment}>{(["volume","asia"] as const).map(k => <Pressable key={k} onPress={() => setNetwork(k)} style={s.segmentHalf}>{network === k ? <Gradient style={s.segmentActive}><Text style={s.segmentActiveText}>{k === "volume" ? "Volume\n$0.005/GB" : "Asia\n$0.03/GB"}</Text></Gradient> : <Text style={s.segmentText}>{k === "volume" ? "Volume $0.005/GB" : "Asia $0.03/GB"}</Text>}</Pressable>)}</Glass></View></View>{r.pctSum !== 100 ? <View style={s.warning}><Text style={s.warningText}>Plan percentages add up to {r.pctSum}% — adjust to 100% for an accurate mix.</Text></View> : null}<View style={s.counts}>{[["Free",r.free],["Premium",r.premium],["Elite",r.elite]].map(([l,v]) => <Glass soft key={String(l)} style={s.count}><Text style={s.countValue}>{v}</Text><Text style={s.copy}>{l}</Text></Glass>)}</View></Glass>
        <Glass style={s.calc}><Text style={s.panelTitle}>Fixed plan values</Text><Text style={s.copy}>Not editable — locked from the business plan.</Text><Table compact rows={[["Price","₹0","₹499","₹999"],["Images","5","40","60"],["Image upload","< 8 MB","< 12 MB","< 20 MB"],["Image stored","≤ 4 MB","≤ 6 MB","≤ 12 MB"],["Clips","—","—","20"],["Clip upload","—","—","< 40 MB"],["Clip stored","—","—","≤ 20 MB"]]} /><View style={s.fixed}>{[["Clips / user / day","30"],["Days per month","30"],["Delivered per view","~4 MB"],["USD → INR","₹88"],["Storage rate","$0.01 / GB"],["Streaming compression","40 MB → ~4 MB"]].map(([a,b]) => <Glass soft key={a} style={s.fixedItem}><Text style={s.copy}>{a}</Text><Text style={s.fixedValue}>{b}</Text></Glass>)}</View></Glass></View>
        <View style={s.three}>{[["Max clip views / month",r.views.toLocaleString("en-IN")],["Video bandwidth",`${r.bandwidthGB.toFixed(1)} GB`],["Stored media",`${r.storageGB.toFixed(2)} GB`]].map(([a,b]) => <Glass soft key={a} style={s.usage}><Text style={s.copy}>{a}</Text><Text style={s.usageValue}>{b}</Text></Glass>)}</View>
        <Glass style={s.results}>
          <View style={s.resultsHeading}><View><Text style={s.panelTitle}>Results</Text><Text style={s.copy}>{monthLabel(CURRENT_MONTH)} · Current month</Text></View><Text style={s.saveState}>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}</Text></View>
          <ResultsBreakdown results={currentResults} taxPercent={n(taxPct)} />
        </Glass>
        <View style={s.historySection}>
          <Text style={s.historyTitle}>Previous months</Text>
          <Text style={s.historyCopy}>{CURRENT_DATE.getFullYear()} results, latest month first</Text>
          {historyLoading ? <View style={s.historyStatus}><ActivityIndicator color="#8B4BEF" /><Text style={s.copy}>Loading monthly results…</Text></View> : null}
          {historyError ? <View style={s.historyError}><Text style={s.historyErrorText}>{historyError}</Text><Pressable accessibilityRole="button" onPress={() => void loadSnapshots()} style={s.retryButton}><Text style={s.retryText}>Try again</Text></Pressable></View> : null}
          {!historyLoading && previousMonths.length === 0 ? <Text style={s.emptyText}>There are no previous months in {CURRENT_DATE.getFullYear()} yet.</Text> : null}
          {!historyLoading ? previousMonths.map((month) => <MonthResultAccordion key={month} month={month} snapshot={snapshotByMonth.get(month)} expanded={expandedMonth === month} onToggle={() => setExpandedMonth((open) => open === month ? null : month)} />) : null}
        </View>
        <Glass style={s.results}>
          <Text style={s.panelTitle}>Annual projection</Text>
          <Text style={s.copy}>On-season uses the monthly results above. Off-season is estimated as a percentage of on-season.</Text>
          <View style={s.annualFields}>
            <Field label="ON-SEASON MONTHS" value={onMonths} set={setOnMonths} hint="Off-season auto = 12 − this"/>
            <Field label="OFF-SEASON MONTHS" value={String(r.off)} set={() => {}} hint="Auto = 12 − on-season" editable={false}/>
            <Field label="OFF-SEASON EARNING VS ON-SEASON" value={offPct} set={setOffPct} suffix="%" hint="Off-season results as % of on-season"/>
          </View>
          <View style={s.yearlyResults}>
            <Text style={s.panelTitle}>Yearly Results</Text>
            <Result label="Gross Revenue (Total Inflow / Sales)" value={money(r.annualRevenue)} strong/>
            <Result label={`Direct Operational Costs (Bunny.net storage ${money(r.annualStorageInr)} + streaming ${money(r.annualBandwidthInr)})`} value={money(r.annualDirectCost)} negative/>
            <Result label="Gross Profit" value={money(r.annualGross)} strong total/>
            <Result label="Operating Expenses (salaries, marketing, rent, gateway, software)" value={money(r.annualExpenses)} negative/>
            <Result label="Net Profit Before Tax (taxable business income)" value={money(r.annualPbt)} strong total/>
            <Result label={`Income Tax (${n(taxPct)}%)`} value={money(r.annualTax)} negative/>
            <Gradient style={s.net}><Text style={s.netLabel}>YEARLY NET REVENUE (NET PROFIT AFTER TAX)</Text><Text style={s.netValue}>{money(r.annualNet)}</Text></Gradient>
          </View>
          <View style={s.three}>{[["On-season net revenue",money(r.onSeasonNet)],["Off-season net revenue",money(r.offSeasonNet)],["Annual Net Revenue / Profit",money(r.annualNet)]].map(([a,b]) => <Glass soft key={a} style={s.annualStat}><Text style={s.copy}>{a}</Text><Text style={s.annualValue}>{b}</Text></Glass>)}</View>
          <View style={s.taxBar}><Text style={s.taxText}>Total tax per year</Text><Text style={s.taxValue}>{money(r.annualTax)}</Text></View>
        </Glass>
      </Section><Text style={s.footerText}>Estimates only. Actual Bunny.net billing varies by network, region and real usage.</Text>
    </ScrollView><AdminFooter activeTab="finance" />
  </SafeAreaView>;
}

function Gradient({children,style}:{children:React.ReactNode;style?:any}) { return <LinearGradient colors={["#3185F6","#8B4BEF","#EF48A0","#FF8828"]} start={{x:0,y:0}} end={{x:1,y:0}} style={style}>{children}</LinearGradient>; }
function Glass({children,style,soft}:{children:React.ReactNode;style?:any;soft?:boolean}) { return <View style={[soft?s.glassSoft:s.glass,style]}>{children}</View>; }
function Section({eyebrow,title,sub,children,marker}:{eyebrow:string;title:string;sub:string;children:React.ReactNode;marker:any}) { return <View {...marker} style={s.section}><Text style={s.sectionEyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionSub}>{sub}</Text>{children}</View>; }
function Field({label,value,set,suffix,hint,editable=true}:{label:string;value:string;set:(v:string)=>void;suffix?:string;hint?:string;editable?:boolean}) { return <View style={s.field}><Text style={s.label}>{label}</Text><Glass soft style={s.inputWrap}><TextInput editable={editable} value={value} onChangeText={set} keyboardType="decimal-pad" style={s.input}/>{suffix?<Text style={s.suffix}>{suffix}</Text>:null}</Glass>{hint?<Text style={s.hint}>{hint}</Text>:null}</View>; }
function Result({label,value,strong,negative,total}:{label:string;value:string;strong?:boolean;negative?:boolean;total?:boolean}) { return <View style={[s.result,total&&s.resultTotal]}><Text style={[s.resultLabel,strong&&s.bold]}>{label}</Text><Text style={[s.resultValue,strong&&s.resultStrong,negative&&s.red]}>{negative?"− ":""}{value}</Text></View>; }
function ResultsBreakdown({results,taxPercent}:{results:ClipFinanceMonthlyResults;taxPercent:number}) { return <><Result label="Gross Revenue (Total Inflow / Sales)" value={money(results.grossRevenue)} strong/><Result label={`Direct Operational Costs (Bunny.net storage ${money(results.storageCost)} + streaming ${money(results.streamingCost)})`} value={money(results.directOperationalCost)} negative/><Result label="Gross Profit" value={money(results.grossProfit)} strong total/><Result label="Operating Expenses (salaries, marketing, rent, gateway, software)" value={money(results.operatingExpenses)} negative/><Result label="Net Profit Before Tax (taxable business income)" value={money(results.profitBeforeTax)} strong total/><Result label={`Income Tax (${taxPercent}%)`} value={money(results.incomeTax)} negative/><Gradient style={s.net}><Text style={s.netLabel}>NET REVENUE (NET PROFIT AFTER TAX)</Text><Text style={s.netValue}>{money(results.netRevenue)}</Text></Gradient></>; }
function MonthResultAccordion({month,snapshot,expanded,onToggle}:{month:string;snapshot?:ClipFinanceMonthlySnapshot;expanded:boolean;onToggle:()=>void}) { return <Glass soft style={s.monthCard}><Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${monthLabel(month)} results`} accessibilityState={{expanded}} onPress={onToggle} style={({pressed}) => [s.monthHeader,pressed&&s.monthHeaderPressed]}><View style={s.monthIdentity}><Text style={s.monthName}>{monthLabel(month)}</Text><Text style={s.monthHint}>{snapshot ? "Monthly net revenue" : "No saved result"}</Text></View><View style={s.monthValueGroup}><Text style={[s.monthNet,!snapshot&&s.monthNetEmpty]}>{snapshot ? money(snapshot.results.netRevenue) : "—"}</Text><View style={[s.chevron,expanded&&s.chevronExpanded]}><ChevronDown size={22} strokeWidth={2.4} color="#6E4DC6" /></View></View></Pressable>{expanded ? <View style={s.monthDetails}>{snapshot ? <ResultsBreakdown results={snapshot.results} taxPercent={snapshot.inputs.incomeTaxPercent} /> : <View style={s.emptyMonth}><Text style={s.emptyMonthTitle}>No result was saved for this month</Text><Text style={s.copy}>Monthly history starts when that month&apos;s calculator result is saved.</Text></View>}</View> : null}</Glass>; }
function Table({rows,compact,header="Item"}:{rows:string[][];compact?:boolean;header?:string}) { return <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={[s.tableInner,compact&&s.tableCompact]}><View style={s.tableRow}><Text style={s.tableLabel}>{header}</Text><Text style={s.tableCell}>Free</Text><Text style={s.tableCell}>Premium</Text><Text style={s.tableCell}>Elite</Text></View>{rows.map(row=><View key={row[0]} style={s.tableRow}><Text style={[s.tableLabel,s.tableMuted]}>{row[0]}</Text>{row.slice(1).map((v,i)=><Text key={`${row[0]}-${i}`} style={s.tableCell}>{v}</Text>)}</View>)}</View></ScrollView>; }

const s=StyleSheet.create({
  page:{flex:1,overflow:"hidden",backgroundColor:"#FAFAFD"},scroll:{paddingBottom:60},blueGlow:{position:"absolute",width:700,height:700,borderRadius:350,backgroundColor:"#DCEBFF",top:-250,left:-260,opacity:.85},pinkGlow:{position:"absolute",width:650,height:650,borderRadius:325,backgroundColor:"#FFE0F1",top:-180,right:-260,opacity:.8},orangeGlow:{position:"absolute",width:600,height:600,borderRadius:300,backgroundColor:"#FFF0DE",bottom:-300,left:"30%",opacity:.65},navWrap:{paddingHorizontal:12,paddingTop:10,backgroundColor:"transparent"},nav:{width:"100%",maxWidth:1160,alignSelf:"center",minHeight:62,borderRadius:20,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{flexDirection:"row",alignItems:"center",gap:9},logo:{width:34,height:34,borderRadius:12,alignItems:"center",justifyContent:"center"},logoText:{color:"white",fontWeight:"800"},brandText:{fontSize:15,fontWeight:"800",color:INK},purple:{color:"#8B4BEF"},navLinks:{flexDirection:"row",alignItems:"center",gap:3},navButton:{paddingHorizontal:15,paddingVertical:11},navText:{fontSize:14,fontWeight:"700",color:"#52525C"},run:{borderRadius:22,paddingHorizontal:21,paddingVertical:12},runText:{color:"white",fontWeight:"800"},menuButton:{width:46,height:42,borderRadius:12,alignItems:"center",justifyContent:"center"},menuText:{fontSize:17,fontWeight:"800",color:INK},mobileMenu:{width:"100%",maxWidth:1160,alignSelf:"center",borderRadius:20,padding:8,marginTop:8},mobileLink:{paddingHorizontal:14,paddingVertical:12,borderRadius:12},glass:{backgroundColor:"rgba(255,255,255,.82)",borderWidth:1,borderColor:"rgba(190,168,239,.28)",boxShadow:"0 20px 55px rgba(119,75,180,.12)" as any},glassSoft:{backgroundColor:"rgba(255,255,255,.68)",borderWidth:1,borderColor:"rgba(160,196,239,.32)",boxShadow:"0 10px 28px rgba(55,125,210,.09)" as any},hero:{width:"100%",maxWidth:1160,alignSelf:"center",paddingHorizontal:16,paddingTop:58,paddingBottom:34,alignItems:"center"},pill:{borderRadius:22,paddingHorizontal:16,paddingVertical:8},eyebrow:{fontSize:12,fontWeight:"800",letterSpacing:1,color:"#4F505A"},heroTitle:{fontSize:56,lineHeight:62,fontWeight:"900",letterSpacing:-2,color:INK,textAlign:"center",maxWidth:800,marginTop:22},heroTitleMobile:{fontSize:38,lineHeight:42,letterSpacing:-1.3},heroCopy:{fontSize:18,lineHeight:28,color:MUTED,textAlign:"center",maxWidth:720,marginTop:16},heroCopyMobile:{fontSize:16,lineHeight:24},three:{flexDirection:"row",flexWrap:"wrap",gap:13,width:"100%",marginTop:28},stat:{flex:1,minWidth:230,borderRadius:26,padding:22},statValue:{fontSize:21,fontWeight:"900",color:INK,marginBottom:5},copy:{fontSize:14,lineHeight:21,color:MUTED},section:{width:"100%",maxWidth:1160,alignSelf:"center",paddingHorizontal:16,paddingVertical:62},sectionEyebrow:{fontSize:12,fontWeight:"800",letterSpacing:2.2,color:"#777985"},sectionTitle:{fontSize:38,lineHeight:45,fontWeight:"900",letterSpacing:-1.2,color:INK,marginTop:9},sectionSub:{fontSize:16,lineHeight:25,color:MUTED,maxWidth:700,marginTop:11,marginBottom:30},plan:{flex:1,minWidth:250,borderRadius:27,padding:24},planHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},planName:{fontSize:21,fontWeight:"900",color:INK},badge:{borderRadius:18,paddingHorizontal:12,paddingVertical:6},badgeText:{fontSize:11,fontWeight:"800",color:"white"},price:{fontSize:38,fontWeight:"900",letterSpacing:-1,color:INK,marginVertical:12},per:{fontSize:15,fontWeight:"700",color:"#7A7B85"},planLine:{fontSize:14,fontWeight:"700",color:INK,marginTop:7},table:{borderRadius:27,padding:10,marginTop:18},tableInner:{minWidth:760,paddingHorizontal:8},tableCompact:{minWidth:620,marginTop:20},tableRow:{minHeight:48,flexDirection:"row",alignItems:"center",borderTopWidth:1,borderTopColor:LINE},tableLabel:{width:230,fontSize:13,fontWeight:"800",color:INK,paddingHorizontal:10},tableMuted:{color:MUTED},tableCell:{width:165,fontSize:13,fontWeight:"800",color:INK,paddingHorizontal:10},calcGrid:{gap:16},calcGridDesktop:{flexDirection:"row"},calc:{flex:1,borderRadius:28,padding:24,minWidth:0},panelTitle:{fontSize:21,fontWeight:"900",color:INK,marginBottom:8},fields:{flexDirection:"row",flexWrap:"wrap",gap:16,marginTop:18},field:{flexGrow:1,flexBasis:250,minWidth:220},label:{fontSize:12,fontWeight:"800",color:"#696A73",marginBottom:7},inputWrap:{height:56,borderRadius:22,paddingHorizontal:16,flexDirection:"row",alignItems:"center"},input:{flex:1,fontSize:18,fontWeight:"800",color:INK,padding:0},suffix:{fontSize:16,fontWeight:"700",color:"#767780"},hint:{fontSize:11,color:"#858691",marginTop:7},segment:{height:56,borderRadius:22,padding:4,flexDirection:"row"},segmentHalf:{flex:1},segmentActive:{flex:1,borderRadius:18,alignItems:"center",justifyContent:"center"},segmentActiveText:{fontSize:12,fontWeight:"800",color:"white",textAlign:"center"},segmentText:{fontSize:12,fontWeight:"800",color:MUTED,textAlign:"center",paddingTop:15},warning:{backgroundColor:"#FFE8EA",borderRadius:15,padding:12,marginTop:16},warningText:{fontSize:12,fontWeight:"800",color:RED},counts:{flexDirection:"row",gap:11,marginTop:20},count:{flex:1,borderRadius:20,padding:16,alignItems:"center"},countValue:{fontSize:24,fontWeight:"900",color:INK},fixed:{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:18},fixedItem:{flexGrow:1,flexBasis:230,minHeight:48,borderRadius:20,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},fixedValue:{fontSize:13,fontWeight:"800",color:INK},usage:{flex:1,minWidth:230,borderRadius:26,padding:21},usageValue:{fontSize:24,fontWeight:"900",color:INK,marginTop:5},results:{borderRadius:28,padding:24,marginTop:18},resultsHeading:{minHeight:48,flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:16},saveState:{fontSize:12,fontWeight:"800",color:"#6E4DC6",paddingTop:4},result:{minHeight:57,borderTopWidth:1,borderTopColor:LINE,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:16},resultTotal:{borderTopWidth:2},resultLabel:{flex:1,fontSize:14,fontWeight:"700",color:MUTED},resultValue:{fontSize:16,fontWeight:"800",color:INK,fontVariant:["tabular-nums"]},resultStrong:{fontSize:19,fontWeight:"900"},bold:{fontWeight:"900",color:INK},red:{color:RED},net:{borderRadius:22,paddingHorizontal:20,paddingVertical:18,marginTop:16,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:10},netLabel:{fontSize:13,fontWeight:"900",color:"white"},netValue:{fontSize:31,fontWeight:"900",color:"white"},historySection:{marginTop:30},historyTitle:{fontSize:21,fontWeight:"900",color:INK},historyCopy:{fontSize:14,lineHeight:21,color:MUTED,marginTop:4,marginBottom:14},historyStatus:{minHeight:64,flexDirection:"row",alignItems:"center",gap:10},historyError:{backgroundColor:"#FFE8EA",borderRadius:15,padding:14,marginBottom:12,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},historyErrorText:{flex:1,fontSize:13,lineHeight:19,fontWeight:"700",color:"#AA1E2A"},retryButton:{minHeight:44,paddingHorizontal:16,borderRadius:14,backgroundColor:"#FFFFFF",alignItems:"center",justifyContent:"center"},retryText:{fontSize:13,fontWeight:"900",color:"#7C43D5"},emptyText:{fontSize:14,lineHeight:21,color:MUTED,paddingVertical:18},monthCard:{borderRadius:20,marginTop:10,overflow:"hidden"},monthHeader:{minHeight:78,paddingHorizontal:18,paddingVertical:13,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:16},monthHeaderPressed:{backgroundColor:"rgba(139,75,239,.05)"},monthIdentity:{flex:1,minWidth:0},monthName:{fontSize:16,fontWeight:"900",color:INK},monthHint:{fontSize:12,color:MUTED,marginTop:3},monthValueGroup:{flexDirection:"row",alignItems:"center",gap:12},monthNet:{fontSize:21,fontWeight:"900",color:INK,fontVariant:["tabular-nums"]},monthNetEmpty:{color:"#9697A0"},chevron:{width:44,height:44,borderRadius:14,backgroundColor:"rgba(139,75,239,.09)",alignItems:"center",justifyContent:"center"},chevronExpanded:{transform:[{rotate:"180deg"}]},monthDetails:{paddingHorizontal:18,paddingBottom:18},emptyMonth:{borderTopWidth:1,borderTopColor:LINE,paddingVertical:22},emptyMonthTitle:{fontSize:15,fontWeight:"900",color:INK,marginBottom:5},annualFields:{flexDirection:"row",flexWrap:"wrap",gap:16,marginTop:24},yearlyResults:{marginTop:30},annualStat:{flex:1,minWidth:220,borderRadius:24,padding:20,alignItems:"center"},annualValue:{fontSize:22,fontWeight:"900",color:INK,marginTop:6},taxBar:{borderRadius:22,backgroundColor:"#FFE7E9",paddingHorizontal:20,paddingVertical:17,marginTop:18,flexDirection:"row",justifyContent:"space-between"},taxText:{fontSize:14,fontWeight:"900",color:RED},taxValue:{fontSize:22,fontWeight:"900",color:RED},footerText:{fontSize:11,color:MUTED,textAlign:"center",paddingHorizontal:16,paddingVertical:28}
});
