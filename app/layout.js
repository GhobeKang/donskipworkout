import './_styles/globals.css';

export const metadata = {
  applicationName: "Don't Skip Workout",
};

export default function RootLayout({ children }) {
  return <html lang="ko"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800;900&family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,500,1,0" rel="stylesheet" /></head><body>{children}</body></html>;
}
