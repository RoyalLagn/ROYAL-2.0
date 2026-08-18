import React, { useEffect, useMemo, useState } from "react";
import FrontendScreen from "@/components/FrontendScreen";
import { DEFAULT_TERMS_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";

export default function Terms() {
  const [content, setContent] = useState(DEFAULT_TERMS_CONTENT);
  useEffect(() => {
    let active = true;
    LegalDocumentsService.loadTerms().then((document) => { if (active) setContent(document.content); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const paragraphs = useMemo(() => content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean), [content]);
  return (
    <FrontendScreen
      title="Terms & Conditions"
      subtitle="Terms for using RoyalLagn"
      mode="info"
      content={paragraphs}
    />
  );
}
