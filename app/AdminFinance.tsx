import React, { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import AdminFooter from "@/components/AdminFooter";
import { adminContentWidth } from "@/utils/responsiveLayout";

const INK = "#151521", MUTED = "#696A75", LINE = "rgba(113,91,180,.16)", RED = "#E82936";
const PLANS = [
  { key: "free", name: "Free", price: 0, images: 15, albums: 3, perAlbum: 5, upload: "< 8 MB", stored: "≤ 4 MB" },
  { key: "premium", name: "Premium", price: 499, images: 50, albums: 5, perAlbum: 10, upload: "< 12 MB", stored: "≤ 6 MB" },
] as const;
const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const n = (value: string) => value.trim() === "" ? 0 : Math.max(0, Number(value) || 0);

export default function AdminFinance() {
  const { width } = useWindowDimensions();
  const desktop = adminContentWidth(width) >= 900;
  const scroll = useRef<ScrollView>(null);
  const positions = useRef<Record<string, number>>({});
  const [vendors, setVendors] = useState("100");
  const [freePct, setFreePct] = useState("60");
  const [premiumPct, setPremiumPct] = useState("40");
  const [expenses, setExpenses] = useState("");
  const [taxPct, setTaxPct] = useState("32.5");
  const [onMonths, setOnMonths] = useState("9");
  const [offPct, setOffPct] = useState("40");
  const [menuOpen, setMenuOpen] = useState(false);

  const r = useMemo(() => {
    const total = n(vendors);
    const free = Math.round(total * n(freePct) / 100);
    const premium = Math.round(total * n(premiumPct) / 100);
    const revenue = premium * 499;
    const storageGB = (free * 15 * 4 + premium * 50 * 6) / 1024;
    const storageInr = storageGB * 0.01 * 88;
    const directCost = storageInr;
    const gross = revenue - directCost;
    const operatingExpenses = n(expenses);
    const pbt = gross - operatingExpenses;
    const tax = pbt > 0 ? pbt * n(taxPct) / 100 : 0;
    const net = pbt - tax;
    const on = Math.min(12, n(onMonths));
    const off = 12 - on;
    const mult = n(offPct) / 100;
    const annualFactor = on + mult * off;
    const annualRevenue = revenue * annualFactor;
    const annualStorageInr = storageInr * 12;
    const annualDirectCost = annualStorageInr;
    const annualGross = annualRevenue - annualDirectCost;
    const annualExpenses = n(expenses) * 12;
    const annualPbt = annualGross - annualExpenses;
    const annualTax = annualPbt > 0 ? annualPbt * n(taxPct) / 100 : 0;
    const annualNet = annualPbt - annualTax;
    const onSeasonNet = net * on;
    const offSeasonNet = annualNet - onSeasonNet;
    return {
      free, premium, revenue, storageGB, storageInr, directCost, gross, operatingExpenses, pbt, tax, net, on, off, mult,
      annualRevenue, annualStorageInr, annualDirectCost,
      annualGross, annualExpenses, annualPbt, annualNet, annualTax, onSeasonNet, offSeasonNet,
      pctSum: n(freePct) + n(premiumPct),
    };
  }, [expenses, freePct, offPct, onMonths, premiumPct, taxPct, vendors]);

  const go = (key: string) => scroll.current?.scrollTo({ y: positions.current[key] ?? 0, animated: true });
  const mark = (key: string) => ({ onLayout: (e: any) => { positions.current[key] = e.nativeEvent.layout.y; } });

  return (
    <SafeAreaView style={s.page} edges={["top", "left", "right"]}>
      <View style={s.blueGlow} /><View style={s.pinkGlow} /><View style={s.orangeGlow} />
      <ScrollView ref={scroll} stickyHeaderIndices={[0]} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.navWrap}>
          <Glass style={s.nav}>
            <Pressable onPress={() => go("top")} style={s.brand}>
              <Gradient style={s.logo}><Text style={s.logoText}>₹</Text></Gradient>
              <Text style={s.brandText}>Platform <Text style={s.purple}>Finance Model</Text></Text>
            </Pressable>
            {desktop ? (
              <View style={s.navLinks}>
                {[["plans","Plans"],["calculator","Calculator"]].map(([k,l]) => (
                  <Pressable key={k} onPress={() => go(k)} style={s.navButton}><Text style={s.navText}>{l}</Text></Pressable>
                ))}
                <Pressable onPress={() => go("calculator")}><Gradient style={s.run}><Text style={s.runText}>Run numbers</Text></Gradient></Pressable>
              </View>
            ) : (
              <Pressable accessibilityLabel="Toggle menu" onPress={() => setMenuOpen(v => !v)} style={[s.glassSoft,s.menuButton]}>
                <Text style={s.menuText}>{menuOpen ? "✕" : "☰"}</Text>
              </Pressable>
            )}
          </Glass>
          {!desktop && menuOpen ? (
            <Glass style={s.mobileMenu}>
              {[["plans","Plans"],["calculator","Calculator"]].map(([k,l]) => (
                <Pressable key={k} onPress={() => { setMenuOpen(false); go(k); }} style={s.mobileLink}>
                  <Text style={s.navText}>{l}</Text>
                </Pressable>
              ))}
            </Glass>
          ) : null}
        </View>

        <View {...mark("top")} style={s.hero}>
          <Glass soft style={s.pill}><Text style={s.eyebrow}>RoyalLagn Vendors · Subscription & Media Economics</Text></Glass>
          <Text style={[s.heroTitle,!desktop&&s.heroTitleMobile]}>Predictable revenue, <Text style={s.purple}>controlled costs.</Text></Text>
          <Text style={[s.heroCopy,!desktop&&s.heroCopyMobile]}>
            Redesigned 2-tier subscription architecture: Free (15 photos) and Premium (50 photos at ₹499/mo). Clean storage economics with high margins.
          </Text>
          <View style={s.three}>
            {[
              ["₹499 / mo","Premium Tier Subscription"],
              ["15 / 50 Photos","Strict per-album quotas (3 & 5 albums)"],
              ["High Margins","Minimal Cloud Storage Overhead"],
            ].map(([a,b]) => (
              <Glass key={a} style={s.stat}><Text style={s.statValue}>{a}</Text><Text style={s.copy}>{b}</Text></Glass>
            ))}
          </View>
        </View>

        <Section marker={mark("plans")} eyebrow="01 · SUBSCRIPTION PLANS" title="Two-Tier Model" sub="Streamlined packages ensuring sustainable unit economics.">
          <View style={s.three}>
            {PLANS.map(p => (
              <Glass key={p.key} style={s.plan}>
                <View style={s.planHead}>
                  <Text style={s.planName}>{p.name}</Text>
                  {p.key === "premium" ? <Gradient style={s.badge}><Text style={s.badgeText}>All Features</Text></Gradient> : null}
                </View>
                <Text style={s.price}>{money(p.price)}<Text style={s.per}> /mo</Text></Text>
                <Text style={s.planLine}>{p.images} images total ({p.albums} albums, {p.perAlbum} per album)</Text>
                <Text style={s.copy}>Upload {p.upload} · Stored {p.stored} per image</Text>
              </Glass>
            ))}
          </View>
          <Glass style={s.table}>
            <Table
              header="Specification"
              rows={[
                ["Price / month","₹0","₹499"],
                ["Total Images","15","50"],
                ["Supported Albums","3 albums (5 img/album)","5 albums (10 img/album)"],
                ["Image upload limit","< 8 MB / image","< 12 MB / image"],
                ["Stored image target","≤ 4 MB / image","≤ 6 MB / image"],
              ]}
            />
          </Glass>
        </Section>

        <Section marker={mark("calculator")} eyebrow="02 · CALCULATOR" title="Profitability calculator" sub="Simulate vendor conversions and projected net income.">
          <View style={[s.calcGrid, desktop && s.calcGridDesktop]}>
            <Glass style={s.calc}>
              <Text style={s.panelTitle}>Inputs</Text>
              <View style={s.fields}>
                <Field label="TOTAL ACTIVE VENDORS" value={vendors} set={setVendors}/>
                <Field label="FREE VENDORS" value={freePct} set={setFreePct} suffix="%"/>
                <Field label="PREMIUM VENDORS (₹499/mo)" value={premiumPct} set={setPremiumPct} suffix="%"/>
                <Field label="MONTHLY OPERATING EXPENSES" value={expenses} set={setExpenses} suffix="₹/mo" hint="Salaries, marketing, rent, gateway fees"/>
                <Field label="INCOME TAX RATE" value={taxPct} set={setTaxPct} suffix="%"/>
              </View>
              {r.pctSum !== 100 ? (
                <View style={s.warning}>
                  <Text style={s.warningText}>Plan percentages add up to {r.pctSum}% — adjust to 100% for an accurate mix.</Text>
                </View>
              ) : null}
              <View style={s.counts}>
                {[["Free (₹0)",r.free],["Premium (₹499)",r.premium]].map(([l,v]) => (
                  <Glass soft key={String(l)} style={s.count}>
                    <Text style={s.countValue}>{v}</Text>
                    <Text style={s.copy}>{l}</Text>
                  </Glass>
                ))}
              </View>
            </Glass>

            <Glass style={s.calc}>
              <Text style={s.panelTitle}>Fixed Parameters</Text>
              <Text style={s.copy}>Media quota & cloud infrastructure rates.</Text>
              <Table compact rows={[
                ["Price","₹0","₹499"],
                ["Images","15","50"],
                ["Albums","3 (5/album)","5 (10/album)"],
                ["Upload Target","< 8 MB","< 12 MB"],
                ["Stored Target","≤ 4 MB","≤ 6 MB"],
              ]} />
              <View style={s.fixed}>
                {[
                  ["Storage rate","$0.01 / GB / mo"],
                  ["USD → INR","₹88 / $"],
                  ["Average Free Storage","~60 MB / vendor"],
                  ["Average Premium Storage","~300 MB / vendor"],
                ].map(([a,b]) => (
                  <Glass soft key={a} style={s.fixedItem}>
                    <Text style={s.copy}>{a}</Text>
                    <Text style={s.fixedValue}>{b}</Text>
                  </Glass>
                ))}
              </View>
            </Glass>
          </View>

          <View style={s.three}>
            {[
              ["Total Stored Media",`${r.storageGB.toFixed(2)} GB`],
              ["Monthly Cloud Storage Cost",money(r.storageInr)],
              ["Gross Monthly Revenue",money(r.revenue)],
            ].map(([a,b]) => (
              <Glass soft key={a} style={s.usage}>
                <Text style={s.copy}>{a}</Text>
                <Text style={s.usageValue}>{b}</Text>
              </Glass>
            ))}
          </View>

          <Glass style={s.results}>
            <View style={s.resultsHeading}>
              <View>
                <Text style={s.panelTitle}>Monthly P&L Summary</Text>
                <Text style={s.copy}>Calculated based on current vendor distribution</Text>
              </View>
            </View>
            <Result label="Gross Subscription Revenue" value={money(r.revenue)} strong/>
            <Result label={`Direct Operational Cost (Storage ${money(r.storageInr)})`} value={money(r.directCost)} negative/>
            <Result label="Gross Profit" value={money(r.gross)} strong total/>
            <Result label="Operating Expenses (salaries, ops, server)" value={money(r.operatingExpenses)} negative/>
            <Result label="Net Profit Before Tax" value={money(r.pbt)} strong total/>
            <Result label={`Income Tax (${n(taxPct)}%)`} value={money(r.tax)} negative/>
            <Gradient style={s.net}>
              <Text style={s.netLabel}>MONTHLY NET PROFIT AFTER TAX</Text>
              <Text style={s.netValue}>{money(r.net)}</Text>
            </Gradient>
          </Glass>

          <Glass style={s.results}>
            <Text style={s.panelTitle}>Annual Projection</Text>
            <Text style={s.copy}>Seasonal adjustments applied across 12 calendar months.</Text>
            <View style={s.annualFields}>
              <Field label="ON-SEASON MONTHS" value={onMonths} set={setOnMonths} hint="Peak wedding season"/>
              <Field label="OFF-SEASON MONTHS" value={String(r.off)} set={() => {}} hint="Auto calculated" editable={false}/>
              <Field label="OFF-SEASON VS ON-SEASON RATIO" value={offPct} set={setOffPct} suffix="%" hint="Off-season revenue ratio"/>
            </View>
            <View style={s.yearlyResults}>
              <Text style={s.panelTitle}>Annual Financial Results</Text>
              <Result label="Annual Gross Revenue" value={money(r.annualRevenue)} strong/>
              <Result label={`Annual Cloud Storage Cost (${money(r.annualStorageInr)})`} value={money(r.annualDirectCost)} negative/>
              <Result label="Annual Gross Profit" value={money(r.annualGross)} strong total/>
              <Result label="Annual Operating Expenses" value={money(r.annualExpenses)} negative/>
              <Result label="Annual Profit Before Tax" value={money(r.annualPbt)} strong total/>
              <Result label={`Annual Income Tax (${n(taxPct)}%)`} value={money(r.annualTax)} negative/>
              <Gradient style={s.net}>
                <Text style={s.netLabel}>ANNUAL NET PROFIT AFTER TAX</Text>
                <Text style={s.netValue}>{money(r.annualNet)}</Text>
              </Gradient>
            </View>
            <View style={s.three}>
              {[
                ["On-season Net Revenue",money(r.onSeasonNet)],
                ["Off-season Net Revenue",money(r.offSeasonNet)],
                ["Annual Projected Profit",money(r.annualNet)],
              ].map(([a,b]) => (
                <Glass soft key={a} style={s.annualStat}><Text style={s.copy}>{a}</Text><Text style={s.annualValue}>{b}</Text></Glass>
              ))}
            </View>
            <View style={s.taxBar}>
              <Text style={s.taxText}>Estimated Annual Tax Liability</Text>
              <Text style={s.taxValue}>{money(r.annualTax)}</Text>
            </View>
          </Glass>
        </Section>
        <Text style={s.footerText}>Projections only. Actual results depend on organic vendor conversion, marketing, and retention.</Text>
      </ScrollView>
      <AdminFooter activeTab="finance" />
    </SafeAreaView>
  );
}

function Gradient({children,style}:{children:React.ReactNode;style?:any}) { return <LinearGradient colors={["#3185F6","#8B4BEF","#EF48A0","#FF8828"]} start={{x:0,y:0}} end={{x:1,y:0}} style={style}>{children}</LinearGradient>; }
function Glass({children,style,soft}:{children:React.ReactNode;style?:any;soft?:boolean}) { return <View style={[soft?s.glassSoft:s.glass,style]}>{children}</View>; }
function Section({eyebrow,title,sub,children,marker}:{eyebrow:string;title:string;sub:string;children:React.ReactNode;marker:any}) { return <View {...marker} style={s.section}><Text style={s.sectionEyebrow}>{eyebrow}</Text><Text style={s.sectionTitle}>{title}</Text><Text style={s.sectionSub}>{sub}</Text>{children}</View>; }
function Field({label,value,set,suffix,hint,editable=true}:{label:string;value:string;set:(v:string)=>void;suffix?:string;hint?:string;editable?:boolean}) { return <View style={s.field}><Text style={s.label}>{label}</Text><Glass soft style={s.inputWrap}><TextInput editable={editable} value={value} onChangeText={set} keyboardType="decimal-pad" style={s.input}/>{suffix?<Text style={s.suffix}>{suffix}</Text>:null}</Glass>{hint?<Text style={s.hint}>{hint}</Text>:null}</View>; }
function Result({label,value,strong,negative,total}:{label:string;value:string;strong?:boolean;negative?:boolean;total?:boolean}) { return <View style={[s.result,total&&s.resultTotal]}><Text style={[s.resultLabel,strong&&s.bold]}>{label}</Text><Text style={[s.resultValue,strong&&s.resultStrong,negative&&s.red]}>{negative?"− ":""}{value}</Text></View>; }
function Table({rows,compact,header="Item"}:{rows:string[][];compact?:boolean;header?:string}) { return <ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={[s.tableInner,compact&&s.tableCompact]}><View style={s.tableRow}><Text style={s.tableLabel}>{header}</Text><Text style={s.tableCell}>Free</Text><Text style={s.tableCell}>Premium (₹499)</Text></View>{rows.map(row=><View key={row[0]} style={s.tableRow}><Text style={[s.tableLabel,s.tableMuted]}>{row[0]}</Text>{row.slice(1).map((v,i)=><Text key={`${row[0]}-${i}`} style={s.tableCell}>{v}</Text>)}</View>)}</View></ScrollView>; }

const s=StyleSheet.create({
  page:{flex:1,overflow:"hidden",backgroundColor:"#FAFAFD"},scroll:{paddingBottom:60},blueGlow:{position:"absolute",width:700,height:700,borderRadius:350,backgroundColor:"#DCEBFF",top:-250,left:-260,opacity:.85},pinkGlow:{position:"absolute",width:650,height:650,borderRadius:325,backgroundColor:"#FFE0F1",top:-180,right:-260,opacity:.8},orangeGlow:{position:"absolute",width:600,height:600,borderRadius:300,backgroundColor:"#FFF0DE",bottom:-300,left:"30%",opacity:.65},navWrap:{paddingHorizontal:12,paddingTop:10,backgroundColor:"transparent"},nav:{width:"100%",maxWidth:1160,alignSelf:"center",minHeight:62,borderRadius:20,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},brand:{flexDirection:"row",alignItems:"center",gap:9},logo:{width:34,height:34,borderRadius:12,alignItems:"center",justifyContent:"center"},logoText:{color:"white",fontWeight:"800"},brandText:{fontSize:15,fontWeight:"800",color:INK},purple:{color:"#8B4BEF"},navLinks:{flexDirection:"row",alignItems:"center",gap:3},navButton:{paddingHorizontal:15,paddingVertical:11},navText:{fontSize:14,fontWeight:"700",color:"#52525C"},run:{borderRadius:22,paddingHorizontal:21,paddingVertical:12},runText:{color:"white",fontWeight:"800"},menuButton:{width:46,height:42,borderRadius:12,alignItems:"center",justifyContent:"center"},menuText:{fontSize:17,fontWeight:"800",color:INK},mobileMenu:{width:"100%",maxWidth:1160,alignSelf:"center",borderRadius:20,padding:8,marginTop:8},mobileLink:{paddingHorizontal:14,paddingVertical:12,borderRadius:12},glass:{backgroundColor:"rgba(255,255,255,.82)",borderWidth:1,borderColor:"rgba(190,168,239,.28)",boxShadow:"0 20px 55px rgba(119,75,180,.12)" as any},glassSoft:{backgroundColor:"rgba(255,255,255,.68)",borderWidth:1,borderColor:"rgba(160,196,239,.32)",boxShadow:"0 10px 28px rgba(55,125,210,.09)" as any},hero:{width:"100%",maxWidth:1160,alignSelf:"center",paddingHorizontal:16,paddingTop:58,paddingBottom:34,alignItems:"center"},pill:{borderRadius:22,paddingHorizontal:16,paddingVertical:8},eyebrow:{fontSize:12,fontWeight:"800",letterSpacing:1,color:"#4F505A"},heroTitle:{fontSize:56,lineHeight:62,fontWeight:"900",letterSpacing:-2,color:INK,textAlign:"center",maxWidth:800,marginTop:22},heroTitleMobile:{fontSize:38,lineHeight:42,letterSpacing:-1.3},heroCopy:{fontSize:18,lineHeight:28,color:MUTED,textAlign:"center",maxWidth:720,marginTop:16},heroCopyMobile:{fontSize:16,lineHeight:24},three:{flexDirection:"row",flexWrap:"wrap",gap:13,width:"100%",marginTop:28},stat:{flex:1,minWidth:230,borderRadius:26,padding:22},statValue:{fontSize:21,fontWeight:"900",color:INK,marginBottom:5},copy:{fontSize:14,lineHeight:21,color:MUTED},section:{width:"100%",maxWidth:1160,alignSelf:"center",paddingHorizontal:16,paddingVertical:62},sectionEyebrow:{fontSize:12,fontWeight:"800",letterSpacing:2.2,color:"#777985"},sectionTitle:{fontSize:38,lineHeight:45,fontWeight:"900",letterSpacing:-1.2,color:INK,marginTop:9},sectionSub:{fontSize:16,lineHeight:25,color:MUTED,maxWidth:700,marginTop:11,marginBottom:30},plan:{flex:1,minWidth:250,borderRadius:27,padding:24},planHead:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},planName:{fontSize:21,fontWeight:"900",color:INK},badge:{borderRadius:18,paddingHorizontal:12,paddingVertical:6},badgeText:{fontSize:11,fontWeight:"800",color:"white"},price:{fontSize:38,fontWeight:"900",letterSpacing:-1,color:INK,marginVertical:12},per:{fontSize:15,fontWeight:"700",color:"#7A7B85"},planLine:{fontSize:14,fontWeight:"700",color:INK,marginTop:7},table:{borderRadius:27,padding:10,marginTop:18},tableInner:{minWidth:620,paddingHorizontal:8},tableCompact:{minWidth:500,marginTop:20},tableRow:{minHeight:48,flexDirection:"row",alignItems:"center",borderTopWidth:1,borderTopColor:LINE},tableLabel:{width:230,fontSize:13,fontWeight:"800",color:INK,paddingHorizontal:10},tableMuted:{color:MUTED},tableCell:{width:165,fontSize:13,fontWeight:"800",color:INK,paddingHorizontal:10},calcGrid:{gap:16},calcGridDesktop:{flexDirection:"row"},calc:{flex:1,borderRadius:28,padding:24,minWidth:0},panelTitle:{fontSize:21,fontWeight:"900",color:INK,marginBottom:8},fields:{flexDirection:"row",flexWrap:"wrap",gap:16,marginTop:18},field:{flexGrow:1,flexBasis:250,minWidth:220},label:{fontSize:12,fontWeight:"800",color:"#696A73",marginBottom:7},inputWrap:{height:56,borderRadius:22,paddingHorizontal:16,flexDirection:"row",alignItems:"center"},input:{flex:1,fontSize:18,fontWeight:"800",color:INK,padding:0},suffix:{fontSize:16,fontWeight:"700",color:"#767780"},hint:{fontSize:11,color:"#858691",marginTop:7},warning:{backgroundColor:"#FFE8EA",borderRadius:15,padding:12,marginTop:16},warningText:{fontSize:12,fontWeight:"800",color:RED},counts:{flexDirection:"row",gap:11,marginTop:20},count:{flex:1,borderRadius:20,padding:16,alignItems:"center"},countValue:{fontSize:24,fontWeight:"900",color:INK},fixed:{flexDirection:"row",flexWrap:"wrap",gap:10,marginTop:18},fixedItem:{flexGrow:1,flexBasis:230,minHeight:48,borderRadius:20,paddingHorizontal:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10},fixedValue:{fontSize:13,fontWeight:"800",color:INK},usage:{flex:1,minWidth:230,borderRadius:26,padding:21},usageValue:{fontSize:24,fontWeight:"900",color:INK,marginTop:5},results:{borderRadius:28,padding:24,marginTop:18},resultsHeading:{minHeight:48,flexDirection:"row",alignItems:"flex-start",justifyContent:"space-between",gap:16},result:{minHeight:57,borderTopWidth:1,borderTopColor:LINE,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:16},resultTotal:{borderTopWidth:2},resultLabel:{flex:1,fontSize:14,fontWeight:"700",color:MUTED},resultValue:{fontSize:16,fontWeight:"800",color:INK,fontVariant:["tabular-nums"]},resultStrong:{fontSize:19,fontWeight:"900"},bold:{fontWeight:"900",color:INK},red:{color:RED},net:{borderRadius:22,paddingHorizontal:20,paddingVertical:18,marginTop:16,flexDirection:"row",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:10},netLabel:{fontSize:13,fontWeight:"900",color:"white"},netValue:{fontSize:31,fontWeight:"900",color:"white"},annualFields:{flexDirection:"row",flexWrap:"wrap",gap:16,marginTop:24},yearlyResults:{marginTop:30},annualStat:{flex:1,minWidth:220,borderRadius:24,padding:20,alignItems:"center"},annualValue:{fontSize:22,fontWeight:"900",color:INK,marginTop:6},taxBar:{borderRadius:22,backgroundColor:"#FFE7E9",paddingHorizontal:20,paddingVertical:17,marginTop:18,flexDirection:"row",justifyContent:"space-between"},taxText:{fontSize:14,fontWeight:"900",color:RED},taxValue:{fontSize:22,fontWeight:"900",color:RED},footerText:{fontSize:11,color:MUTED,textAlign:"center",paddingHorizontal:16,paddingVertical:28}
});
