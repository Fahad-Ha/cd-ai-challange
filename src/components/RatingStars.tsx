export function RatingStars({ rating, size = "text-base" }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-tight text-pending`} aria-label={`${rating} of 5 stars`} role="img">
      {"★".repeat(rating)}<span className="text-line">{"★".repeat(5 - rating)}</span>
    </span>
  );
}
