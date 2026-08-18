import React, { useEffect, useMemo, useState } from "react";
import FrontendScreen from "@/components/FrontendScreen";
import { DEFAULT_PRIVACY_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";

export default function PrivacyPolicy() {
  const [content, setContent] = useState(DEFAULT_PRIVACY_CONTENT);
  useEffect(() => {
    let active = true;
    LegalDocumentsService.loadPrivacy().then((document) => { if (active) setContent(document.content); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const paragraphs = useMemo(() => content.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean), [content]);
  return (
    <FrontendScreen
      title="Privacy Policy"
      subtitle="How RoyalLagn handles your information"
      mode="info"
      content={paragraphs}
    />
  );
}
