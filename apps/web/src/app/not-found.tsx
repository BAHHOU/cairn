import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="text-sm text-muted-foreground">
        Ce projet n'existe pas ou n'est pas visible pour votre rôle.
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Retour à la vue d'ensemble
      </Link>
    </div>
  );
}
