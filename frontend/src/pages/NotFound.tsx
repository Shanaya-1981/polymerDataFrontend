import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NotFound() {
  return (
    <>
      <PageHeader
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
      />
      <Link to="/" className="text-accent hover:text-accent-hover underline underline-offset-4">
        Back to home
      </Link>
    </>
  );
}
