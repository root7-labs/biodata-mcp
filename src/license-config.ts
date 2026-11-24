// Fill these in once your Polar product exists (see LAUNCH.md, step "Set up Polar").
// Both values are safe to publish.

/** Your Polar organization ID (Polar dashboard → Settings → Organization ID). */
export const POLAR_ORGANIZATION_ID = "e39dfc88-1017-408a-b038-8c3fcd847e65";

/** Hosted Polar checkout link for BioData MCP Pro. Shown to free users. */
export const DEFAULT_UPGRADE_URL = "https://buy.polar.sh/polar_cl_izX9bcMQvKqrvU4t66u2P4pp07GycLlSpQoSq45gkOW";

/** Polar API base. Polar's sandbox is https://sandbox-api.polar.sh for testing. */
export const POLAR_API_BASE = process.env.BIODATA_POLAR_API ?? "https://api.polar.sh";
