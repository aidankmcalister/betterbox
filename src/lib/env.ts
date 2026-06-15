/**
 * Self-host mode flag, following Cal.com's IS_SELF_HOSTED convention.
 *
 * `true` → this is someone's own self-hosted instance: no landing page, no
 * waitlist, straight to the app. Unset (or anything other than "true") → the
 * official hosted deployment, with the marketing layer intact.
 */
export const IS_SELF_HOSTED = process.env.IS_SELF_HOSTED === "true";
