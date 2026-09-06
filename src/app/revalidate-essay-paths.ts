import { revalidatePath } from "next/cache";

/**
 * Every path a saved essay version can affect, in one place.
 *
 * Lives outside essay-actions.ts (a "use server" file) because Next.js
 * requires every export of a "use server" module to be an async function -
 * this plain sync helper is shared by essay-actions.ts and shorten-actions.ts
 * instead of being redeclared in each.
 */
export function revalidateEssayPaths(essayId?: string) {
  revalidatePath("/");
  revalidatePath("/schools");
  revalidatePath("/essays");
  revalidatePath("/families");
  revalidatePath("/reuse");
  revalidatePath("/editor");
  if (essayId) revalidatePath(`/editor/${essayId}`);
}
