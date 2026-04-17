"use client";
import { useRouter } from "next/navigation";
import LegalLayout from "@/components/LegalLayout";
import PrivacyPage from "@/components/PrivacyPage";

export default function Page() {
  const router = useRouter();
  const setPage = (p) => {
    if (p === "Home") router.push("/");
    else if (p === "Privacy") router.push("/privacy");
    else if (p === "Terms") router.push("/terms");
    else router.push("/");
  };
  return (
    <LegalLayout>
      <PrivacyPage setPage={setPage} />
    </LegalLayout>
  );
}
