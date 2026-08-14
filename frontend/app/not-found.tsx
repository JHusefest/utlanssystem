import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      <div className="title">Fant ikke siden</div>
      <p className="small muted">Lenken finnes ikke lenger, eller er skrevet feil.</p>
      <p style={{ marginTop: 14 }}>
        <Link href="/" className="btn btn-primary">
          Til oversikten
        </Link>
      </p>
    </div>
  );
}
