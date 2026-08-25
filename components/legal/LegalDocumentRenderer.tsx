import React, { useMemo } from "react";
import { Text, View } from "react-native";

type InlinePart = { kind: "text" | "strong" | "emphasis" | "code"; value: string };
type LegalBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: Array<{ text: string; depth: number }> };

const LEGAL_SUBSECTIONS = new Set([
  "Account and authentication information",
  "Public-user information",
  "Vendor information",
  "Enquiries and communications",
  "Location information",
  "Photos, videos and documents",
  "Payment and subscription information",
  "Notifications and device information",
  "Usage and activity information",
  "With Public Users and Vendors",
  "With service providers",
  "With external applications",
  "For legal, security and corporate purposes",
]);

function inlineParts(value: string): InlinePart[] {
  const matches = value.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return matches.map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) return { kind: "strong", value: part.slice(2, -2) };
    if (part.startsWith("*") && part.endsWith("*")) return { kind: "emphasis", value: part.slice(1, -1) };
    if (part.startsWith("`") && part.endsWith("`")) return { kind: "code", value: part.slice(1, -1) };
    return { kind: "text", value: part };
  });
}

function parseDocument(source: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<LegalBlock, { kind: "list" }> | null = null;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };
  const flushList = () => {
    if (list?.items.length) blocks.push(list);
    list = null;
  };

  for (const rawLine of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }
    const numberedHeading = line.match(/^\s*(\d+)\.\s+([^.;:]+)$/);
    const documentTitle = line.match(/^\s*(ROYALLAGN\s+.+(?:POLICY|CONDITIONS))\s*$/i);
    const subsection = LEGAL_SUBSECTIONS.has(line.trim());
    if (numberedHeading || documentTitle || subsection) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: documentTitle ? 1 : subsection ? 3 : 2,
        text: documentTitle ? documentTitle[1].trim() : subsection ? line.trim() : `${numberedHeading![1]}. ${numberedHeading![2].trim()}`,
      });
      continue;
    }
    const bullet = line.match(/^(\s*)[-*+]\s+(.+)$/);
    const ordered = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
    const item = bullet ?? ordered;
    if (item) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) flushList();
      if (!list) list = { kind: "list", ordered: isOrdered, items: [] };
      list.items.push({ text: item[2].trim(), depth: Math.min(3, Math.floor(item[1].replace(/\t/g, "  ").length / 2)) });
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  return blocks;
}

function InlineText({ children }: { children: string }) {
  return <>{inlineParts(children).map((part, index) => (
    <Text
      key={`${index}-${part.value}`}
      className={part.kind === "strong" ? "font-bold" : part.kind === "emphasis" ? "italic" : part.kind === "code" ? "font-semibold text-primary" : undefined}
    >
      {part.value}
    </Text>
  ))}</>;
}

export function LegalDocumentRenderer({ content, compact = false }: { content: string; compact?: boolean }) {
  const blocks = useMemo(() => parseDocument(content), [content]);
  if (!blocks.length) return <Text className="text-muted-foreground text-sm">Your structured preview will appear here.</Text>;

  return <View className={compact ? "gap-3" : "gap-5"}>
    {blocks.map((block, index) => {
      if (block.kind === "heading") {
        const headingClass = block.level === 1
          ? compact ? "text-foreground text-xl font-bold leading-7" : "text-foreground text-2xl font-bold leading-8"
          : block.level === 2
            ? compact ? "text-foreground text-base font-bold leading-6 mt-2" : "text-foreground text-lg font-bold leading-7 mt-3"
            : "text-foreground text-sm font-bold leading-6 mt-1";
        return <Text accessibilityRole="header" key={`${index}-${block.text}`} className={headingClass}><InlineText>{block.text}</InlineText></Text>;
      }
      if (block.kind === "paragraph") {
        return <Text key={`${index}-${block.text.slice(0, 24)}`} className={compact ? "text-foreground text-sm leading-6" : "text-foreground text-base leading-7"}><InlineText>{block.text}</InlineText></Text>;
      }
      return <View key={`list-${index}`} className={compact ? "gap-2" : "gap-2.5"}>
        {block.items.map((item, itemIndex) => (
          <View key={`${itemIndex}-${item.text}`} className="flex-row items-start" style={{ marginLeft: item.depth * 18 }}>
            <Text className={compact ? "text-primary text-sm font-bold leading-6 w-6" : "text-primary text-base font-bold leading-7 w-7"}>
              {block.ordered ? `${itemIndex + 1}.` : "•"}
            </Text>
            <Text className={compact ? "text-foreground text-sm leading-6 flex-1" : "text-foreground text-base leading-7 flex-1"}><InlineText>{item.text}</InlineText></Text>
          </View>
        ))}
      </View>;
    })}
  </View>;
}
