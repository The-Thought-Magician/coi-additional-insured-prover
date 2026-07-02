import type { Metadata } from 'next'
import { Work_Sans } from 'next/font/google'
import './globals.css'

const workSans = Work_Sans({
  subsets: ['latin'],
  variable: '--font-work-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'CoiAdditionalInsuredProver',
  description: 'Prove every vendor COI actually transfers risk: the right additional-insured endorsement, P&NC, waiver of subrogation, and limits — not just a checked box.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={workSans.variable}>
      <body className="bg-stone-100 text-stone-900 min-h-screen antialiased">{children}</body>
    </html>
  )
}
