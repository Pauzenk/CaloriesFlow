export type FoodServing = {
  label: string;
  grams: number;
};

export type Food = {
  id: string;
  name: string;
  category: string;
  per100g: {
    calories: number;
    proteins: number;
    carbs: number;
    fats: number;
  };
  servings: FoodServing[];
};

export const FOODS: Food[] = [
  {
    id: "chicken-breast",
    name: "Chicken breast (cooked)",
    category: "Protein",
    per100g: { calories: 165, proteins: 31, carbs: 0, fats: 3.6 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 small fillet (120 g)", grams: 120 },
      { label: "1 medium fillet (170 g)", grams: 170 },
    ],
  },
  {
    id: "chicken-thigh",
    name: "Chicken thigh (cooked, skinless)",
    category: "Protein",
    per100g: { calories: 209, proteins: 26, carbs: 0, fats: 10.9 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 thigh (110 g)", grams: 110 },
    ],
  },
  {
    id: "salmon",
    name: "Salmon (cooked)",
    category: "Protein",
    per100g: { calories: 206, proteins: 22, carbs: 0, fats: 12 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 fillet (150 g)", grams: 150 },
    ],
  },
  {
    id: "tuna-canned",
    name: "Tuna (canned in water)",
    category: "Protein",
    per100g: { calories: 116, proteins: 26, carbs: 0, fats: 1 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 can (142 g)", grams: 142 },
    ],
  },
  {
    id: "egg",
    name: "Egg (whole, large)",
    category: "Protein",
    per100g: { calories: 155, proteins: 13, carbs: 1.1, fats: 11 },
    servings: [
      { label: "1 large egg (50 g)", grams: 50 },
      { label: "2 large eggs (100 g)", grams: 100 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "egg-white",
    name: "Egg white",
    category: "Protein",
    per100g: { calories: 52, proteins: 11, carbs: 0.7, fats: 0.2 },
    servings: [
      { label: "1 egg white (33 g)", grams: 33 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "ground-beef-85",
    name: "Ground beef 85% (cooked)",
    category: "Protein",
    per100g: { calories: 250, proteins: 26, carbs: 0, fats: 17 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 patty (113 g)", grams: 113 },
    ],
  },
  {
    id: "tofu",
    name: "Tofu (firm)",
    category: "Protein",
    per100g: { calories: 144, proteins: 17, carbs: 2.8, fats: 8.7 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1/2 block (150 g)", grams: 150 },
    ],
  },
  {
    id: "greek-yogurt",
    name: "Greek yogurt (non-fat)",
    category: "Dairy",
    per100g: { calories: 59, proteins: 10, carbs: 3.6, fats: 0.4 },
    servings: [
      { label: "100 g", grams: 100 },
      { label: "1 cup (245 g)", grams: 245 },
      { label: "Single-serve cup (170 g)", grams: 170 },
    ],
  },
  {
    id: "milk-2",
    name: "Milk (2%)",
    category: "Dairy",
    per100g: { calories: 50, proteins: 3.3, carbs: 4.8, fats: 2 },
    servings: [
      { label: "1 cup (244 g)", grams: 244 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "cheddar",
    name: "Cheddar cheese",
    category: "Dairy",
    per100g: { calories: 403, proteins: 25, carbs: 1.3, fats: 33 },
    servings: [
      { label: "1 slice (28 g)", grams: 28 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "rice-white",
    name: "White rice (cooked)",
    category: "Grains",
    per100g: { calories: 130, proteins: 2.7, carbs: 28, fats: 0.3 },
    servings: [
      { label: "1 cup (158 g)", grams: 158 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "rice-brown",
    name: "Brown rice (cooked)",
    category: "Grains",
    per100g: { calories: 123, proteins: 2.7, carbs: 26, fats: 1 },
    servings: [
      { label: "1 cup (195 g)", grams: 195 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "oats",
    name: "Oats (dry, rolled)",
    category: "Grains",
    per100g: { calories: 379, proteins: 13, carbs: 68, fats: 6.5 },
    servings: [
      { label: "1/2 cup (40 g)", grams: 40 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "bread-whole-wheat",
    name: "Whole wheat bread",
    category: "Grains",
    per100g: { calories: 247, proteins: 13, carbs: 41, fats: 3.4 },
    servings: [
      { label: "1 slice (43 g)", grams: 43 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "pasta",
    name: "Pasta (cooked)",
    category: "Grains",
    per100g: { calories: 131, proteins: 5, carbs: 25, fats: 1.1 },
    servings: [
      { label: "1 cup (140 g)", grams: 140 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "tortilla-flour",
    name: "Flour tortilla",
    category: "Grains",
    per100g: { calories: 306, proteins: 8, carbs: 50, fats: 8 },
    servings: [
      { label: "1 medium (49 g)", grams: 49 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "potato",
    name: "Potato (baked, with skin)",
    category: "Vegetables",
    per100g: { calories: 93, proteins: 2.5, carbs: 21, fats: 0.1 },
    servings: [
      { label: "1 medium (173 g)", grams: 173 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "sweet-potato",
    name: "Sweet potato (baked)",
    category: "Vegetables",
    per100g: { calories: 90, proteins: 2, carbs: 21, fats: 0.1 },
    servings: [
      { label: "1 medium (151 g)", grams: 151 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "broccoli",
    name: "Broccoli (cooked)",
    category: "Vegetables",
    per100g: { calories: 35, proteins: 2.4, carbs: 7.2, fats: 0.4 },
    servings: [
      { label: "1 cup (156 g)", grams: 156 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "spinach",
    name: "Spinach (raw)",
    category: "Vegetables",
    per100g: { calories: 23, proteins: 2.9, carbs: 3.6, fats: 0.4 },
    servings: [
      { label: "1 cup (30 g)", grams: 30 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "avocado",
    name: "Avocado",
    category: "Fruit",
    per100g: { calories: 160, proteins: 2, carbs: 9, fats: 15 },
    servings: [
      { label: "1/2 avocado (100 g)", grams: 100 },
      { label: "1 whole (200 g)", grams: 200 },
    ],
  },
  {
    id: "banana",
    name: "Banana",
    category: "Fruit",
    per100g: { calories: 89, proteins: 1.1, carbs: 23, fats: 0.3 },
    servings: [
      { label: "1 medium (118 g)", grams: 118 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "apple",
    name: "Apple",
    category: "Fruit",
    per100g: { calories: 52, proteins: 0.3, carbs: 14, fats: 0.2 },
    servings: [
      { label: "1 medium (182 g)", grams: 182 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "blueberries",
    name: "Blueberries",
    category: "Fruit",
    per100g: { calories: 57, proteins: 0.7, carbs: 14, fats: 0.3 },
    servings: [
      { label: "1 cup (148 g)", grams: 148 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "strawberries",
    name: "Strawberries",
    category: "Fruit",
    per100g: { calories: 32, proteins: 0.7, carbs: 7.7, fats: 0.3 },
    servings: [
      { label: "1 cup (152 g)", grams: 152 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "almonds",
    name: "Almonds",
    category: "Nuts & Seeds",
    per100g: { calories: 579, proteins: 21, carbs: 22, fats: 50 },
    servings: [
      { label: "1 oz / 23 nuts (28 g)", grams: 28 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "peanut-butter",
    name: "Peanut butter",
    category: "Nuts & Seeds",
    per100g: { calories: 588, proteins: 25, carbs: 20, fats: 50 },
    servings: [
      { label: "1 tbsp (16 g)", grams: 16 },
      { label: "2 tbsp (32 g)", grams: 32 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "olive-oil",
    name: "Olive oil",
    category: "Fats & Oils",
    per100g: { calories: 884, proteins: 0, carbs: 0, fats: 100 },
    servings: [
      { label: "1 tbsp (14 g)", grams: 14 },
      { label: "1 tsp (5 g)", grams: 5 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "butter",
    name: "Butter",
    category: "Fats & Oils",
    per100g: { calories: 717, proteins: 0.9, carbs: 0.1, fats: 81 },
    servings: [
      { label: "1 tbsp (14 g)", grams: 14 },
      { label: "1 tsp (5 g)", grams: 5 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "black-beans",
    name: "Black beans (cooked)",
    category: "Legumes",
    per100g: { calories: 132, proteins: 8.9, carbs: 24, fats: 0.5 },
    servings: [
      { label: "1 cup (172 g)", grams: 172 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "lentils",
    name: "Lentils (cooked)",
    category: "Legumes",
    per100g: { calories: 116, proteins: 9, carbs: 20, fats: 0.4 },
    servings: [
      { label: "1 cup (198 g)", grams: 198 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "chickpeas",
    name: "Chickpeas (cooked)",
    category: "Legumes",
    per100g: { calories: 164, proteins: 8.9, carbs: 27, fats: 2.6 },
    servings: [
      { label: "1 cup (164 g)", grams: 164 },
      { label: "100 g", grams: 100 },
    ],
  },
  {
    id: "protein-shake",
    name: "Whey protein shake",
    category: "Other",
    per100g: { calories: 400, proteins: 80, carbs: 8, fats: 6 },
    servings: [
      { label: "1 scoop (30 g)", grams: 30 },
      { label: "2 scoops (60 g)", grams: 60 },
    ],
  },
  {
    id: "pizza-cheese",
    name: "Cheese pizza",
    category: "Other",
    per100g: { calories: 266, proteins: 11, carbs: 33, fats: 10 },
    servings: [
      { label: "1 slice (107 g)", grams: 107 },
      { label: "100 g", grams: 100 },
    ],
  },
];

export function searchFoods(query: string, limit = 10): Food[] {
  const q = query.trim().toLowerCase();
  if (!q) return FOODS.slice(0, limit);
  const scored = FOODS.map((f) => {
    const name = f.name.toLowerCase();
    let score = -1;
    if (name.startsWith(q)) score = 3;
    else if (name.includes(q)) score = 2;
    else if (f.category.toLowerCase().includes(q)) score = 1;
    return { f, score };
  })
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name))
    .slice(0, limit)
    .map((s) => s.f);
  return scored;
}

export function macrosForServing(food: Food, grams: number) {
  const factor = grams / 100;
  return {
    calories: Math.round(food.per100g.calories * factor),
    proteins: Math.round(food.per100g.proteins * factor * 10) / 10,
    carbs: Math.round(food.per100g.carbs * factor * 10) / 10,
    fats: Math.round(food.per100g.fats * factor * 10) / 10,
  };
}
