import DownloadClient from './download-client';
import type { Metadata } from 'next';
import { getFile } from '../../../../lib/db';

// We override metadata so shared links convey context instead of generic upload page meta
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  // Attempt to look up the file name (best-effort; ignore errors)
  let name: string | undefined;
  try {
    const rec = await getFile(params.id);
    if (rec && (!rec.expiresAt || new Date(rec.expiresAt) > new Date())) {
      name = rec.originalName;
    }
  } catch {}
  const baseTitle = 'A file was shared with you';
  const title = name ? `${name} · ${baseTitle} via Pastry` : `${baseTitle} via Pastry`;
  const description = name ? `Download ${name} – temporary, secure file shared with you on Pastry.` : 'Download a temporary, secure file shared with you on Pastry.';
  const url = process.env.PASTRY_PUBLIC_BASE ? `${process.env.PASTRY_PUBLIC_BASE}/file/${params.id}` : undefined;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: 'Pastry',
      type: 'website'
    },
    twitter: {
      card: 'summary',
      title,
      description
    },
    icons: {
      icon: '/favicon.ico'
    }
  };
}

export default function DownloadPage({ params }: { params: { id: string } }) {
  return <DownloadClient id={params.id} />;
}
