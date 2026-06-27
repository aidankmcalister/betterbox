/** Snippet `{{token}}` keys that auto-fill from the To: recipient — as opposed
 *  to custom fill-in fields you type. Shared by the editor (chip styling) and
 *  the settings live-preview so they can't drift apart. */
export const VARIABLE_KEYS = new Set([
  "first_name",
  "last_name",
  "name",
  "full_name",
  "email",
]);

/** Sample recipient used to preview how a snippet's variables expand. */
export const PREVIEW_CONTACT: Record<string, string> = {
  first_name: "Maya",
  last_name: "Chen",
  name: "Maya Chen",
  full_name: "Maya Chen",
  email: "maya@acme.com",
};
