import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import QRCode from "react-native-qrcode-svg";
import { fonts } from "@/constants/typography";
import {
  Brush,
  CalendarCheck,
  Camera,
  Clock,
  CornerLeftDown,
  Crown,
  Flower,
  Gem,
  Globe,
  Heart,
  Image as ImageIcon,
  Instagram,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  Music,
  PartyPopper,
  Phone,
  Plane,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Users,
  Utensils,
  Video,
} from "lucide-react-native";

// =====================================================================
// The ONE fixed RoyalLagn Vendor Marketing Card.
//
// Fixed 3:2 LANDSCAPE canvas, authored at 1500x1000 and exported at
// 3000x2000, recreating the production master card. Every vendor receives
// this exact layout, palette, typography and decoration -- only the values
// in `MarketingCardData` differ. Nothing here is vendor-configurable.
//
// Regions are absolutely positioned against the 1500x1000 canvas so the
// composition is pinned to the master rather than reflowing: header lockup
// + site pill across the top, vendor identity down the left, service and
// trust boxes beneath it, logo medallion over the cover photo top-right,
// QR block bottom-right, contact bar + brand footer across the bottom.
//
// `width` drives everything through `s()`, so this same component renders
// both the on-screen live preview and the full-resolution off-screen clone
// captured for the PDF (see MarketingCardPdf.tsx).
//
// THREE RULES when editing this file, all learned from real capture bugs:
//
//  1. NEVER use `numberOfLines`. react-native-web implements it with
//     `overflow: hidden` (+ `-webkit-line-clamp`), and html2canvas -- which
//     rasterises this card for the PDF -- lays glyphs out on a slightly
//     lower baseline than the browser, so the bottom of every clamped line
//     gets sliced off in the exported file even though the on-screen
//     preview looks perfect. Truncate with `clip()` instead.
//  2. ALWAYS give a Text an explicit `lineHeight`. With `line-height:
//     normal` the same baseline mismatch clips descenders (Georgia, used
//     for the vendor name, needs a notably loose ratio).
//  3. NEVER use shadow*/elevation. html2canvas renders box-shadow as a
//     hard-edged rectangle with square corners, which printed as a grey
//     block inside the rounded boxes. Use borders for separation.
// =====================================================================

const BASE_WIDTH = 1500;
const BASE_HEIGHT = 1000;
export const CARD_ASPECT_RATIO = BASE_WIDTH / BASE_HEIGHT; // 3:2 landscape

const LOGO = require("@/assets/Logo/light-logo.png");

// Brand palette, sampled from the master card.
const ROSE = "#E8117F";
const ROSE_SOFT = "#F472A0";
const INK = "#1F1119";
const INK_SOFT = "#6B5A63";
const GOLD = "#C9A227";
const GOLD_SOFT = "#E3C77E";
const PINK_PILL = "#FDE7EF";
const PINK_TINT = "#FBD5E4";
const BOX_BG = "#FEF7FA";
const BOX_BORDER = "#F6DEE9";

export type MarketingCardData = {
  businessName: string;
  category: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  city: string;
  state: string;
  profileUrl: string;
  rating: number;
  reviewCount: number;
  isVerified: boolean;
  highlights: [string, string, string, string];
  mobileNumber: string;
  whatsappNumber: string;
  email: string;
  instagram: string;
  website: string;
  tagline: string;
  experienceYears: string;
  happyClients: string;
};

/** JS-side truncation -- see rule 1 above for why this replaces numberOfLines. */
function clip(value: string | null | undefined, max: number) {
  const text = (value ?? "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ---------------------------------------------------------------------
// Brand asset crops. assets/Logo/light-logo.png is a single 1536x1024
// lockup (emblem + wordmark) surrounded by transparent padding. Rather
// than ship two more image files we window into it: the fractions below
// are the measured bounding boxes of the full lockup and of the circular
// emblem on its own.
// ---------------------------------------------------------------------
const SRC_RATIO = 1024 / 1536; // source height / width

function BrandLockup({ width }: { width: number }) {
  const imageWidth = width * 1.1252;
  const imageHeight = imageWidth * SRC_RATIO;
  return (
    <View style={{ width, height: width * 0.30037, overflow: "hidden" }}>
      <Image
        source={LOGO}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: imageWidth,
          height: imageHeight,
          left: -width * 0.07325,
          top: -width * 0.18678,
        }}
      />
    </View>
  );
}

function BrandEmblem({ size }: { size: number }) {
  const imageWidth = size * 3.888;
  const imageHeight = imageWidth * SRC_RATIO;
  return (
    <View style={{ width: size, height: size, overflow: "hidden" }}>
      <Image
        source={LOGO}
        resizeMode="stretch"
        style={{
          position: "absolute",
          width: imageWidth,
          height: imageHeight,
          left: -size * 0.266,
          top: -size * 0.6835,
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------
// Service-box icons. The four highlights themselves are chosen by category
// (see MarketingHighlights.ts) and never by the vendor; this only picks a
// matching glyph so the row reads like the master card.
// ---------------------------------------------------------------------
const HIGHLIGHT_ICONS: { match: RegExp; icon: React.ComponentType<any> }[] = [
  { match: /drone|aerial/i, icon: Send },
  { match: /video|cinema|film/i, icon: Video },
  { match: /album/i, icon: ImageIcon },
  { match: /makeup|airbrush/i, icon: Brush },
  { match: /mehendi|mehndi|arabic/i, icon: Flower },
  { match: /decor|floral|stage|theme/i, icon: Flower },
  { match: /dj|sound|music|band|orchestra|song/i, icon: Music },
  { match: /light/i, icon: Lightbulb },
  { match: /dance|choreo|sangeet|performance/i, icon: PartyPopper },
  { match: /menu|cuisine|counter|cater|beverage|food/i, icon: Utensils },
  { match: /jewel|gold|diamond/i, icon: Gem },
  { match: /travel|honeymoon|fleet|convoy|car/i, icon: Plane },
  { match: /ritual|vedic|muhurat|ceremon/i, icon: Sparkles },
  { match: /venue|hall|lawn|accommodat/i, icon: MapPin },
  { match: /plan|coordinat|manage|guest|itinerar/i, icon: CalendarCheck },
  { match: /invit|print|deliver|express/i, icon: ImageIcon },
  { match: /candid|photograph|shoot|portrait/i, icon: Camera },
  { match: /design|custom|styl/i, icon: ImageIcon },
];
const FALLBACK_ICONS = [Sparkles, Star, Heart, Crown];

function highlightIcon(label: string, index: number): React.ComponentType<any> {
  const found = HIGHLIGHT_ICONS.find((entry) => entry.match.test(label));
  return found?.icon ?? FALLBACK_ICONS[index % FALLBACK_ICONS.length];
}

function brandSite(profileUrl: string) {
  const match = /^https?:\/\/([^/]+)/i.exec(profileUrl);
  const host = (match?.[1] ?? "royallagn.com").replace(/^www\./i, "");
  return `www.${host}`;
}

export default function MarketingCardPreview({
  data,
  width = 560,
}: {
  data: MarketingCardData;
  width?: number;
}) {
  const scale = width / BASE_WIDTH;
  const s = (value: number) => value * scale;
  const height = width / CARD_ASPECT_RATIO;
  const location = [data.city, data.state].filter(Boolean).join(", ");
  const site = brandSite(data.profileUrl);

  return (
    <View style={[styles.card, { width, height, borderRadius: s(30), borderWidth: s(2) }]}>
      {/* ---------- Fixed decorative background ---------- */}
      <LinearGradient
        colors={["#FFFFFF", "#FFF6FA", "#FDEAF2"]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      {/* One barely-there bloom behind the medallion. Kept faint on purpose:
          at higher alpha the circle reads as a hard-edged disc rather than
          the master's smooth wash. */}
      <View style={[styles.bokeh, { width: s(520), height: s(520), borderRadius: s(260), top: s(120), right: s(120) }]} />

      {/* ---------- Cover photo, top-right, feathered into the background ---------- */}
      <View style={{ position: "absolute", top: 0, right: 0, width: s(370), height: s(618), overflow: "hidden", borderTopRightRadius: s(30) }}>
        {data.coverImageUrl ? (
          <Image source={{ uri: data.coverImageUrl }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#F7CEDE", "#EFAAC6"]} style={StyleSheet.absoluteFillObject} />
        )}
        {/* Feather the left and bottom edges so the photo melts into the card */}
        <LinearGradient
          colors={["#FDEAF2", "rgba(253,234,242,0.55)", "rgba(253,234,242,0)"]}
          locations={[0, 0.35, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFillObject}
        />
        <LinearGradient
          colors={["rgba(253,234,242,0)", "rgba(253,234,242,0.6)", "#FDEAF2"]}
          locations={[0.55, 0.82, 1]}
          style={StyleSheet.absoluteFillObject}
        />
      </View>

      {/* ---------- Header: RoyalLagn lockup + brand website pill ---------- */}
      <View style={{ position: "absolute", left: s(56), top: s(52) }}>
        <BrandLockup width={s(512)} />
      </View>
      <View
        style={[
          styles.sitePill,
          { position: "absolute", left: s(618), top: s(74), paddingHorizontal: s(22), paddingVertical: s(11), borderRadius: s(30), gap: s(11), borderWidth: s(1.5) },
        ]}
      >
        <Globe size={s(24)} color={ROSE} />
        <Text style={[styles.sitePillText, { fontSize: s(23), lineHeight: s(31) }]}>{site}</Text>
      </View>

      {/* ---------- Vendor logo medallion, over the cover photo ---------- */}
      <View
        style={[
          styles.medallion,
          { position: "absolute", left: s(820), top: s(150), width: s(348), height: s(348), borderRadius: s(174), borderWidth: s(6) },
        ]}
      >
        {data.logoUrl ? (
          <Image source={{ uri: data.logoUrl }} style={{ width: "100%", height: "100%", borderRadius: s(168) }} resizeMode="contain" />
        ) : (
          <BrandEmblem size={s(336)} />
        )}
      </View>

      {/* ---------- Vendor identity, left column ---------- */}
      <View style={{ position: "absolute", left: s(58), top: s(252), width: s(740) }}>
        {/* Georgia has deep descenders; this needs a looser line-height ratio
            than the rest of the card or html2canvas slices the tails off
            "g/p/y" in the exported PDF (see rule 2 at the top of this file). */}
        <Text style={[styles.businessName, { fontSize: s(58), lineHeight: s(80) }]}>
          {clip(data.businessName, 26)}
        </Text>

        <View style={[styles.rowStart, { marginTop: s(12) }]}>
          <View style={[styles.categoryPill, { paddingHorizontal: s(20), paddingVertical: s(10), borderRadius: s(12), gap: s(10) }]}>
            <Camera size={s(23)} color={ROSE} />
            <Text style={[styles.categoryText, { fontSize: s(23), lineHeight: s(31) }]}>{clip(data.category, 34)}</Text>
          </View>
        </View>

        <View style={[styles.rowStart, { marginTop: s(16), gap: s(18) }]}>
          <View style={[styles.rowStart, { gap: s(9) }]}>
            <MapPin size={s(23)} color={ROSE} />
            <Text style={[styles.metaText, { fontSize: s(22), lineHeight: s(30) }]}>{clip(location, 26)}</Text>
          </View>
          {data.reviewCount > 0 ? (
            <>
              <View style={[styles.metaDivider, { height: s(28), width: s(1.5) }]} />
              <View style={[styles.rowStart, { gap: s(9) }]}>
                <Star size={s(23)} color="#F5B301" fill="#F5B301" />
                <Text style={[styles.ratingText, { fontSize: s(23), lineHeight: s(30) }]}>
                  {data.rating.toFixed(1)}{" "}
                  <Text style={[styles.metaText, { fontSize: s(21), lineHeight: s(30) }]}>({data.reviewCount} Reviews)</Text>
                </Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Tagline between fixed gold flourishes */}
        <View style={[styles.rowStart, { marginTop: s(22), gap: s(16) }]}>
          <Flourish s={s} />
          {/* Sized so a master-length tagline sits on one line, while a longer
              one may take two without reaching the service box at y=558. */}
          <Text style={[styles.tagline, { fontSize: s(26), lineHeight: s(36) }]}>
            “{clip(data.tagline, 56)}”
          </Text>
          <Flourish s={s} flip />
        </View>
      </View>

      {/* ---------- Service box (category highlights, system-chosen) ---------- */}
      <Box s={s} top={558} left={58} width={952} height={106}>
        {data.highlights.map((label, index) => (
          <Cell key={label} s={s} icon={highlightIcon(label, index)} label={label} />
        ))}
      </Box>

      {/* ---------- Trust box ---------- */}
      <Box s={s} top={684} left={58} width={952} height={106}>
        <Cell s={s} icon={ShieldCheck} label={"Trusted\n& Verified"} />
        <Cell s={s} icon={Users} label={`${clip(data.happyClients, 8)}\nHappy Clients`} />
        <Cell s={s} icon={Trophy} label={"High Quality\nWork"} />
        <Cell s={s} icon={Clock} label={`${clip(data.experienceYears, 4)} Years\nExperience`} />
      </Box>

      {/* ---------- QR block, bottom-right ---------- */}
      <View
        style={[
          styles.qrCard,
          { position: "absolute", left: s(1064), top: s(482), width: s(380), height: s(350), borderRadius: s(22), padding: s(16), borderWidth: s(2) },
        ]}
      >
        <Text style={[styles.qrTitle, { fontSize: s(21), lineHeight: s(28) }]}>Scan to View{"\n"}Our Profile</Text>
        <View style={[styles.rowStart, { marginTop: s(8), gap: s(10) }]}>
          <View style={[styles.qrBox, { padding: s(9), borderRadius: s(12), borderWidth: s(2.5) }]}>
            <QRCode value={data.profileUrl} size={s(178)} backgroundColor="#FFFFFF" ecl="H" />
            <View style={[styles.qrEmblem, { width: s(50), height: s(50), borderRadius: s(10), borderWidth: s(2.5) }]}>
              <BrandEmblem size={s(42)} />
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, alignItems: "center" }}>
            <CornerLeftDown size={s(30)} color={ROSE_SOFT} />
            <Text style={[styles.qrLead, { fontSize: s(17), lineHeight: s(23), marginTop: s(6) }]}>Scan me to connect instantly!</Text>
            <Heart size={s(22)} color={ROSE_SOFT} style={{ marginTop: s(8) }} />
          </View>
        </View>
        <View style={[styles.whatsappButton, { marginTop: s(10), borderRadius: s(22), paddingVertical: s(10), gap: s(9) }]}>
          <MessageCircle size={s(21)} color="#FFFFFF" />
          <Text style={[styles.whatsappText, { fontSize: s(20), lineHeight: s(27) }]}>Chat on WhatsApp</Text>
        </View>
      </View>

      {/* ---------- Contact bar ---------- */}
      <LinearGradient
        colors={["#F368A0", "#EA2A80"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", left: 0, right: 0, top: s(842), height: s(80), flexDirection: "row", alignItems: "center", paddingHorizontal: s(40) }}
      >
        <Contact s={s} icon={Phone} value={clip(data.mobileNumber, 18)} />
        <BarDivider s={s} />
        <Contact s={s} icon={Instagram} value={data.instagram ? clip(`@${data.instagram.replace(/^@/, "")}`, 20) : ""} />
        <BarDivider s={s} />
        <Contact s={s} icon={Mail} value={clip(data.email, 24)} />
        <BarDivider s={s} />
        <Contact s={s} icon={data.website ? Globe : MapPin} value={data.website ? clip(data.website.replace(/^https?:\/\//i, ""), 22) : clip(location, 22)} />
      </LinearGradient>

      {/* ---------- Fixed RoyalLagn footer ---------- */}
      <LinearGradient
        colors={["#EC3183", "#DE1370"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", left: 0, right: 0, top: s(922), bottom: 0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(16) }}
      >
        <FooterOrnament s={s} />
        <Text style={[styles.footerText, { fontSize: s(22), lineHeight: s(30) }]}>Find Trusted Wedding Vendors Only on</Text>
        <View style={[styles.footerPill, { paddingHorizontal: s(18), paddingVertical: s(9), borderRadius: s(24), gap: s(9) }]}>
          <Globe size={s(20)} color={ROSE} />
          <Text style={[styles.footerPillText, { fontSize: s(21), lineHeight: s(28) }]}>{site}</Text>
        </View>
        <FooterOrnament s={s} flip />
      </LinearGradient>
    </View>
  );
}

// ---------------------------------------------------------------------
// Fixed sub-elements
// ---------------------------------------------------------------------
function Flourish({ s, flip }: { s: (value: number) => number; flip?: boolean }) {
  return (
    <View style={[styles.rowStart, { gap: s(6) }, flip && styles.flip]}>
      <View style={[styles.flourishLine, { width: s(34), height: s(1.5) }]} />
      <Crown size={s(20)} color={GOLD} />
    </View>
  );
}

function FooterOrnament({ s, flip }: { s: (value: number) => number; flip?: boolean }) {
  return (
    <View style={[styles.rowStart, { gap: s(9) }, flip && styles.flip]}>
      <Heart size={s(15)} color="rgba(255,255,255,0.7)" fill="rgba(255,255,255,0.7)" />
      <View style={[styles.footerRule, { width: s(46), height: s(1.5) }]} />
      <Heart size={s(19)} color="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.85)" />
    </View>
  );
}

function Box({
  s,
  top,
  left,
  width,
  height,
  children,
}: {
  s: (value: number) => number;
  top: number;
  left: number;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <View
      style={[
        styles.box,
        {
          position: "absolute",
          left: s(left),
          top: s(top),
          width: s(width),
          height: s(height),
          borderRadius: s(20),
          borderWidth: s(2),
          paddingHorizontal: s(8),
        },
      ]}
    >
      {items.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={[styles.cellDivider, { width: s(1.5), height: s(58) }]} /> : null}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

function Cell({
  s,
  icon: Icon,
  label,
}: {
  s: (value: number) => number;
  icon: React.ComponentType<any>;
  label: string;
}) {
  return (
    <View style={[styles.cell, { paddingHorizontal: s(12), gap: s(13) }]}>
      <View style={[styles.cellIcon, { width: s(52), height: s(52), borderRadius: s(15) }]}>
        <Icon size={s(26)} color={ROSE} />
      </View>
      <Text style={[styles.cellLabel, { fontSize: s(19), lineHeight: s(26), flex: 1 }]}>{label}</Text>
    </View>
  );
}

function Contact({
  s,
  icon: Icon,
  value,
}: {
  s: (value: number) => number;
  icon: React.ComponentType<any>;
  value: string;
}) {
  return (
    <View style={[styles.contactItem, { gap: s(12) }]}>
      <View style={[styles.contactIcon, { width: s(40), height: s(40), borderRadius: s(20) }]}>
        <Icon size={s(21)} color={ROSE} />
      </View>
      <Text style={[styles.contactText, { fontSize: s(20), lineHeight: s(27) }]}>{value}</Text>
    </View>
  );
}

function BarDivider({ s }: { s: (value: number) => number }) {
  return <View style={[styles.barDivider, { width: s(1.5), height: s(38) }]} />;
}

const styles = StyleSheet.create({
  // NOTE: no shadow*/elevation anywhere in this file -- see rule 3 at the top.
  card: { overflow: "hidden", backgroundColor: "#FFFFFF", borderColor: "#F4D8E5" },
  bokeh: { position: "absolute", backgroundColor: "rgba(240,140,185,0.055)" },
  rowStart: { flexDirection: "row", alignItems: "center" },
  flip: { transform: [{ scaleX: -1 }] },

  sitePill: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#F7DCE8" },
  sitePillText: { color: INK, fontWeight: "700" },

  medallion: { overflow: "hidden", backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },

  businessName: { color: INK, fontFamily: fonts.serif.bold },
  categoryPill: { flexDirection: "row", alignItems: "center", backgroundColor: PINK_PILL },
  categoryText: { color: ROSE, fontWeight: "700" },
  metaDivider: { backgroundColor: "#EFD3DF" },
  metaText: { color: INK_SOFT, fontWeight: "600" },
  ratingText: { color: INK, fontWeight: "700" },
  tagline: { color: INK, fontFamily: fonts.serif.boldItalic, flexShrink: 1 },
  flourishLine: { backgroundColor: GOLD_SOFT },

  box: { flexDirection: "row", alignItems: "center", backgroundColor: BOX_BG, borderColor: BOX_BORDER },
  cellDivider: { backgroundColor: "#F3DCE7" },
  cell: { flex: 1, flexDirection: "row", alignItems: "center" },
  cellIcon: { backgroundColor: PINK_TINT, alignItems: "center", justifyContent: "center" },
  cellLabel: { color: INK, fontWeight: "700" },

  qrCard: { backgroundColor: "#FFFFFF", borderColor: BOX_BORDER },
  qrTitle: { color: INK, fontWeight: "700", textAlign: "center" },
  qrBox: { backgroundColor: "#FFFFFF", borderColor: ROSE, alignItems: "center", justifyContent: "center" },
  qrEmblem: { position: "absolute", backgroundColor: "#FFFFFF", borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  qrLead: { color: INK_SOFT, fontWeight: "700", textAlign: "center" },
  whatsappButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: ROSE },
  whatsappText: { color: "#FFFFFF", fontWeight: "700" },

  contactItem: { flex: 1, flexDirection: "row", alignItems: "center" },
  contactIcon: { backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  contactText: { color: "#FFFFFF", fontWeight: "700", flexShrink: 1 },
  barDivider: { backgroundColor: "rgba(255,255,255,0.35)", marginHorizontal: 4 },

  footerRule: { backgroundColor: "rgba(255,255,255,0.55)" },
  footerText: { color: "#FFFFFF", fontWeight: "700" },
  footerPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#FFFFFF" },
  footerPillText: { color: INK, fontWeight: "700" },
});
