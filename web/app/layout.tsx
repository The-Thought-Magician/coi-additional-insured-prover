import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'CoiAdditionalInsuredProver',
  description: 'Prove every vendor COI actually transfers risk: the right additional-insured endorsement, P&NC, waiver of subrogation, and limits — not just a checked box.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-slate-100 min-h-screen antialiased">{children}</body>
    </html>
  )
}
