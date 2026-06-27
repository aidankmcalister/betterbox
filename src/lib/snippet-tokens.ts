/** Must match the keys the composer resolves (`variables` in composer.tsx), else they preview filled but send empty. */
export const VARIABLE_KEYS = new Set([
  "first_name",
  "last_name",
  "name",
  "email",
]);

export const PREVIEW_CONTACT: Record<string, string> = {
  first_name: "Maya",
  last_name: "Chen",
  name: "Maya Chen",
  email: "maya@acme.com",
};
