interface FeatureCardProps {
  badge: string;
  title: string;
  description: string;
}

const FEATURE_CARDS: FeatureCardProps[] = [
  {
    badge: "Goals",
    title: "Science-based targets",
    description: "Daily calories calculated from your body and your goal.",
  },
  {
    badge: "AI",
    title: "Snap or type your meal",
    description: "Instant nutrition for rotis, dals, curries and more.",
  },
  {
    badge: "Private",
    title: "Your data stays yours",
    description: "Only you can see your logs and profile.",
  },
];

export default function LandingFeatureCards() {
  return (
    <section
      aria-label="Core Features"
      className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 lg:mt-auto pt-8 pb-4"
    >
      {FEATURE_CARDS.map((card) => (
        <article
          key={card.badge}
          className="bg-white rounded-[28px] p-6 shadow-[0_1px_3px_rgba(34,51,45,0.06)] border border-[#dfe6e1]/40 flex flex-col items-start transition-transform hover:-translate-y-0.5"
        >
          <span className="inline-block rounded-full bg-[#eaf1ec] px-3.5 py-1 text-xs font-semibold text-[#22332d]">
            {card.badge}
          </span>
          <h2 className="text-[18px] font-bold text-[#22332d] mt-3 mb-1.5">
            {card.title}
          </h2>
          <p className="text-[14px] text-[#5b6b64] leading-relaxed">
            {card.description}
          </p>
        </article>
      ))}
    </section>
  );
}

