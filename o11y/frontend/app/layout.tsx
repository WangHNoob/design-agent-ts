import type { Metadata } from "next"
import { Geist, JetBrains_Mono } from "next/font/google"
import "./globals.css"

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "O11y 可观测性控制台",
  description: "多智能体系统实时可观测性控制台 — 链路追踪、日志分析、性能监控",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${jetbrainsMono.variable}`}>
      <body className="h-screen w-screen overflow-hidden bg-app-bg text-app-text font-ui antialiased">
        {children}
      </body>
    </html>
  )
}
