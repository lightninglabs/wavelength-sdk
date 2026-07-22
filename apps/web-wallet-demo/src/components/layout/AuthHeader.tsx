// AuthHeader is the heading block atop each onboarding form. The mobile brand
// lockup lives in AuthLayout rather than here, so it sits at the top of the
// page instead of travelling with this vertically centred block.
export function AuthHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-xl font-semibold text-fg">{title}</h1>
      <p className="mt-1 text-sm text-muted">{sub}</p>
    </div>
  );
}
