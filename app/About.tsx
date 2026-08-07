import React from "react";
import FrontendScreen from "@/components/FrontendScreen";

export default function About() {
  return (
    <FrontendScreen
      title="About RoyalLagn"
      subtitle="Your wedding vendor marketplace"
      mode="info"
      content={[
        "RoyalLagn helps couples discover trusted wedding professionals across categories including venues, photography, catering, decor and styling.",
        "Every vendor listed is reviewed and approved before appearing in search, so you can reach out with confidence.",
      ]}
    />
  );
}
