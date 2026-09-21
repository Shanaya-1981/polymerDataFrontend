export function Footer() {
  return (
    <footer className="border-t border-subtle">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted sm:px-6 lg:px-8">
        <p>
          Data from Nicole Schauser et al., UC Santa Barbara / NSF MRSEC DMR 1720256. MIT licensed —{" "}
          <a
            href="https://github.com/nschauser/PolymerElectrolyte"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:text-accent-hover underline underline-offset-4"
          >
            github.com/nschauser/PolymerElectrolyte
          </a>
          .
        </p>
      </div>
    </footer>
  );
}
