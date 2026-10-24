import { Suspense } from "react";
import BankApplication from "../components/bank/app";
import PersonalApplication from "./personal-app";
export const dynamic = "force-dynamic";
export default function Page() {
  return process.env.APP_VARIANT === "alfa" ? (
    <Suspense fallback={<div className="bank-boot">КОНТЕКСТ</div>}>
      <BankApplication />
    </Suspense>
  ) : (
    <PersonalApplication />
  );
}
