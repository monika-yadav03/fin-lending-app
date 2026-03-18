import "./globals.css"

export const metadata = {
 title: "FinLending",
 description: "FinLending AI assistant"
}

export default function RootLayout({ children }) {
 return (
  <html lang="en">
   <body>{children}</body>
  </html>
 )
}