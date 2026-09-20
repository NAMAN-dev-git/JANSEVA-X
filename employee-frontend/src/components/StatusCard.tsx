interface StatusCardProps {
  label: string;
  value: number | string;
  description: string;
  tone: "blue" | "green" | "amber" | "slate";
}

export function StatusCard({ label, value, description, tone }: StatusCardProps) {
  return (
    <section className={`status-card status-card--${tone}`} aria-label={label}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{description}</span>
    </section>
  );
}
