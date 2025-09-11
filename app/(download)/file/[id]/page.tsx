import DownloadClient from './download-client';

export default function DownloadPage({ params }: { params: { id: string } }) {
  return <DownloadClient id={params.id} />;
}
