import { Suspense } from "react";
import BankApplication from "../../../components/bank/app";
export default function Page() {
  return (
    <Suspense fallback={<div className="bank-boot">КОНТЕКСТ</div>}>
      <BankApplication />
    </Suspense>
  );
}
