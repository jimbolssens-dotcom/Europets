import { supabaseServer } from '@/lib/supabaseServer';
import { BOOKING_URL } from '@/lib/content';

export const metadata = { title: 'Reviews — Europets Clinic' };
export const revalidate = 300;

function Stars({ rating }) {
  return (
    <span className="review-stars" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(5 - rating)}
    </span>
  );
}

export default async function ReviewsPage() {
  const { data } = await supabaseServer
    .from('review_requests')
    .select('rating, comment, display_name, reviewed_at')
    .eq('status', 'approved')
    .order('reviewed_at', { ascending: false })
    .limit(50);

  const reviews = data || [];

  return (
    <div className="section">
      <div className="container">
        <span className="eyebrow">What pet owners say</span>
        <h1 className="page-title">Reviews from our clients</h1>
        <p className="page-lede">
          Every review here comes from a real client we&apos;ve treated at Europets — nothing is written by us.
        </p>

        {reviews.length === 0 && (
          <p className="reviews-empty">We&apos;re just getting started collecting reviews here — check back soon.</p>
        )}

        <div className="reviews-grid">
          {reviews.map((r, i) => (
            <div key={i} className="card review-card">
              <Stars rating={r.rating} />
              {r.comment && <p className="review-comment">&ldquo;{r.comment}&rdquo;</p>}
              <p className="review-author">{r.display_name}</p>
            </div>
          ))}
        </div>

        <div className="card services-cta">
          <h2>Ready to visit us?</h2>
          <p>Book an appointment and see why pet owners across Sharjah trust us with their pets.</p>
          <a href={BOOKING_URL} className="btn btn-primary">
            Book an Appointment
          </a>
        </div>
      </div>
    </div>
  );
}
