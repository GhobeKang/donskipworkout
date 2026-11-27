import './_styles/globals.css';

export const metadata = {
  applicationName: "Don't Skip Workout",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" /></head><body>{children}</body></html>;
}
