type Props = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

// Sarlavha sidebar/mobile-navda bor — bu yerda takrorlanmaydi.
// Faqat subtitle (loyiha nomi va h.k.) va action tugmalari ko'rsatiladi.
export function PageHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="flex flex-row items-center justify-between gap-2 border-b border-border pb-2 sm:pb-3">
      <div className="min-w-0 flex-1">
        {/* visually-hidden h1 — SEO/a11y uchun */}
        <h1 className="sr-only">{title}</h1>
        {subtitle && <p className="truncate text-xs font-medium text-muted-foreground sm:text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">{actions}</div>}
    </div>
  );
}


