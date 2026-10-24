import type { ReactNode } from "react";
import "./globals.css";
import "./editorial.css";
import "./bank.css";
export const metadata = {
  title: "Контекст — аналитика Альфа-Бизнеса",
  description: "Новости, контекст компании и экспертиза банка",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
