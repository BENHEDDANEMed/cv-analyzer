import { EmptyState } from "../components/ui";
import { Link } from "../lib/router";

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon="search" title="Page introuvable" text="Cette adresse n'existe pas ou a été déplacée."
        action={<Link to="/" className="btn btn-primary">Retour au tableau de bord</Link>} />
    </div>
  );
}
