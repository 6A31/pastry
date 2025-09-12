import UploadPanel from '../components/UploadPanel';
import RecentList from '../components/RecentList';

// Force dynamic rendering so environment-driven flags (admin/password requirements)
// always reflect current runtime configuration. Without this, the page could be
// statically optimized at build time and omit the admin password field if the
// env was disabled then later enabled in production.
export const dynamic = 'force-dynamic';

export default function HomePage() {
  // Read env on the server to ensure SSR + hydration consistency
  const adminOnly = process.env.PASTRY_ADMIN_ONLY_UPLOADS === 'true';
  const requireFilePw = process.env.PASTRY_REQUIRE_FILE_PASSWORDS === 'true';
  const maxSize = Number(process.env.PASTRY_MAX_FILE_SIZE || 50 * 1024 * 1024);
  return (
    <main className="space-y-12">
      <section>
  <UploadPanel adminOnly={adminOnly} requireFilePw={requireFilePw} maxSize={maxSize} />
      </section>
      <section>
        <RecentList />
      </section>
    </main>
  );
}
