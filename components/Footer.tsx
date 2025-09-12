export default function Footer() {
  return (
    <footer className="mt-16 border-t border-neutral-800 pt-6 text-center text-xs text-neutral-600">
      <p>
        <span className="text-neutral-500">Powered by </span>
        <a
          href="https://github.com/6A31/pastry"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-neutral-300 hover:text-brand-400 transition"
        >Pastry</a>
      </p>
    </footer>
  );
}
