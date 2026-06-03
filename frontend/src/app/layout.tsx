import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Math Copilot - 数学大模型约束工程',
  description: 'AI 驱动的数学解题助手，支持几何可视化与交互式探索',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/jsxgraph/1.9.0/jsxgraph.css"
          integrity="sha512-8/g2GQVn/4etPT0MMwYd6mUHKLGqspxmxVDj7fnF3eX1zlJOFJxn9aK6p/2RgljSl+1z5g37eKt8KMyGxjHCRQ=="
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
      </head>
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
