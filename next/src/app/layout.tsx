import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Casa inteligente | Monitoramento',
  description: 'Distância, temperatura, umidade e movimento do ESP32 em um só lugar.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
