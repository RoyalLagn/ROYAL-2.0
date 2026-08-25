import React, { useEffect, useState } from "react";
import FrontendScreen from "@/components/FrontendScreen";
import { DEFAULT_PRIVACY_CONTENT, LegalDocumentsService } from "@/services/legalDocuments";

export default function VendorPrivacyPolicy() {
  const [content, setContent] = useState(DEFAULT_PRIVACY_CONTENT);
  useEffect(() => {
    let active = true;
    LegalDocumentsService.loadPrivacy().then((document) => { if (active) setContent(document.content); }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return (
    <FrontendScreen
      title="Privacy Policy"
      subtitle="How RoyalLagn handles vendor information"
      mode="info"
      content={content}
    />
  );
}
