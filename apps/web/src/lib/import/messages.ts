import type { GitErrorCode } from "@cairn/git";

const MESSAGES: Record<GitErrorCode, string> = {
  invalid_url: "L'URL du dépôt n'est pas valide. Attendu : https://hôte/groupe/projet.",
  invalid_branch: "Nom de branche invalide.",
  credentials_in_url: "Retirez les identifiants de l'URL : utilisez le champ « Jeton d'accès ».",
  host_not_allowed:
    "Cet hôte n'est pas autorisé. Ajoutez-le à GIT_HOSTS (liste blanche des hôtes Git de Cairn).",
  unauthorized: "Jeton refusé, expiré ou sans les droits nécessaires.",
  not_found: "Dépôt introuvable, ou le jeton n'y a pas accès.",
  branch_not_found: "Cette branche n'existe pas dans le dépôt.",
  rate_limited: "Limite de requêtes du fournisseur atteinte. Réessayez plus tard.",
  unreachable: "Hôte injoignable depuis Cairn (réseau, proxy ou certificat).",
  timeout: "Le fournisseur n'a pas répondu à temps.",
  provider_error: "Réponse inattendue du fournisseur.",
  clone_failed: "Le clonage a échoué.",
  git_missing: "git n'est pas installé sur la machine qui exécute le worker.",
  secret_key_missing: "CAIRN_SECRET_KEY n'est pas configurée (clé de chiffrement des jetons).",
  interrupted: "Import interrompu (arrêt du worker). Relancez-le.",
  internal: "Erreur interne. Consultez les journaux du worker.",
};

export function describeError(code: string | null | undefined): string {
  if (!code) return "Erreur inconnue.";
  return MESSAGES[code as GitErrorCode] ?? "Erreur inconnue.";
}
