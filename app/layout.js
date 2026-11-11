import "./globals.css";

export const metadata = {
  title: "Job Pipeline",
  description: "Job discovery and application tracker",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
