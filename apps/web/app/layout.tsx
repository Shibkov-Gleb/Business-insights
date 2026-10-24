import type { ReactNode } from "react";
import "./globals.css";
import "./editorial.css";
export const metadata = {
  title: "Контекст — рыночная разведка",
  description: "Конкуренты, изменения рынка и основания для следующего решения",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
