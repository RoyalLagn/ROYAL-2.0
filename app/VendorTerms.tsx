import React, { useEffect, useState } from "react";
import FrontendScreen from "@/components/FrontendScreen";
import { DEFAULT_TERMS_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";

export default function VendorTerms() {
  const [content, setContent] = useState(DEFAULT_TERMS_CONTENT);
  useEffect(() => {
    let active = true;
    LegalDocumentsService.loadTerms().then((document) => { if (active) setContent(document.content); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return (
    <FrontendScreen
      title="Terms & Conditions"
      subtitle="Terms for using the RoyalLagn vendor workspace"
      mode="info"
      content={content}
    />
  );
}
