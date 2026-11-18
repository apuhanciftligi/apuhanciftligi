import type { Metadata } from "next";

import { getRecipesNewestFirst } from "@/features/content/application/get-recipes";
import { buildPageMetadata } from "@/features/storefront/application/page-metadata";
import { RecipeIndex } from "@/features/content/ui/recipe-index";

export const metadata: Metadata = buildPageMetadata({
  title: "Yumurta, kayısı ve dut pekmeziyle ev tarifleri",
  description:
    "Köy yumurtası, kuru kayısı, dut kurusu ve dut pekmeziyle çılbır, bulgur pilavı, hoşaf ve kurabiye. Ölçülü, adım adım Apuhan Çiftliği tarifleri.",
  canonical: "/tarifler",
});

export default function RecipesPage() {
  return <RecipeIndex recipes={getRecipesNewestFirst()} />;
}
