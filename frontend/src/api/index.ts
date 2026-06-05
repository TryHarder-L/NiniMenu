import { api, getUploadErrorMessage } from "./client"
import defaultClient from "./client"
import type { Dish, DishInput, PaginatedData, PickResult, BlindBoxResult, MealRecord, StatsData, DashboardData, Achievement, WeekPlan, ShoppingCategory, ShoppingCategoryOverride, Holiday, Quote, DayRating, PhotoWall, DishRecordsResponse, DishCategoryCounts, FavoriteOverview } from "@/types"

export const dishesApi = {
  list: (params?: Record<string, string>) =>
    api<PaginatedData<Dish>>("GET", "/dishes", params),
  categoryCounts: () => api<DishCategoryCounts>("GET", "/dishes/category-counts"),
  get: (id: number) => api<Dish>("GET", `/dishes/${id}`),
  records: (id: number) => api<DishRecordsResponse>("GET", `/dishes/${id}/records`),
  create: (data: DishInput) => api<Dish>("POST", "/dishes", data),
  update: (id: number, data: DishInput) => api<Dish>("PUT", `/dishes/${id}`, data),
  delete: (id: number) => api<null>("DELETE", `/dishes/${id}`),
  toggle: (id: number) => api<Dish>("PUT", `/dishes/${id}/toggle`),
  clone: (id: number) => api<Dish>("POST", `/dishes/${id}/clone`),
  batchToggle: (ids: number[], enabled: boolean) => api<null>("POST", "/dishes/batch-toggle", { ids, enabled }),
  batchDelete: (ids: number[]) => api<null>("POST", "/dishes/batch-delete", { ids }),
  batchCategory: (ids: number[], category: string) => api<null>("POST", "/dishes/batch-category", { ids, category }),
}

export const pickApi = {
  lunch: (count?: number) => api<PickResult>("POST", `/pick/lunch${count ? `?count=${count}` : ""}`),
  dinner: (count?: number) => api<PickResult>("POST", `/pick/dinner${count ? `?count=${count}` : ""}`),
  mood: (mood: string) => api<PickResult>("POST", "/pick/mood", { mood }),
  tomorrow: (data: { meal_type: string; profile: string; count: number; exclude_ids?: number[] }) =>
    api<PickResult>("POST", "/pick/tomorrow", data),
  blindBox: () => api<BlindBoxResult>("POST", "/pick/blind-box"),
}

export const recordsApi = {
  list: (params?: Record<string, string>) =>
    api<PaginatedData<MealRecord>>("GET", "/records", params),
  create: (data: Partial<MealRecord>) => api<MealRecord>("POST", "/records", data),
  batchCreate: (data: Partial<MealRecord>[]) => api<{ created: MealRecord[]; skipped: number; total: number }>("POST", "/records/batch", { records: data }),
  update: (id: number, data: Partial<MealRecord>) =>
    api<MealRecord>("PUT", `/records/${id}`, data),
  delete: (id: number) => api<null>("DELETE", `/records/${id}`),
}

export const favoritesApi = {
  list: () => api<Dish[]>("GET", "/favorites"),
  overview: () => api<FavoriteOverview>("GET", "/favorites/overview"),
  add: (dishId: number) => api<null>("POST", `/favorites/${dishId}`),
  remove: (dishId: number) => api<null>("DELETE", `/favorites/${dishId}`),
}

export { getUploadErrorMessage }

export const uploadApi = {
  image: (file: File) => {
    const formData = new FormData()
    formData.append("image", file)
    return defaultClient.post<{ code: number; message: string; data: { url: string; filename: string } }>("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })
  },
}

export const statsApi = {
  get: () => api<StatsData>("GET", "/stats"),
}

export const authApi = {
  appLogin: (password: string) => api<{ verified: boolean }>("POST", "/app/login", { password }),
  login: (password: string) => api<{ token: string }>("POST", "/admin/login", { password }),
}

export const quotesApi = {
  list: () => api<Quote[]>("GET", "/quotes"),
  create: (data: { content: string; scene: string }) => api<Quote>("POST", "/quotes", data),
  update: (id: number, data: { content: string; scene: string }) => api<Quote>("PUT", `/quotes/${id}`, data),
  delete: (id: number) => api<null>("DELETE", `/quotes/${id}`),
}

export const achievementsApi = {
  list: async () => {
    const data = await api<Achievement[] | null>("GET", "/achievements")
    return Array.isArray(data) ? data : []
  },
  unlock: (id: number) => api<null>("POST", `/achievements/${id}/unlock`),
  toggle: (id: number) => api<null>("POST", `/achievements/${id}/toggle`),
  create: (data: Partial<Achievement>) => api<Achievement>("POST", "/achievements", data),
  update: (id: number, data: Partial<Achievement>) => api<Achievement>("PUT", `/achievements/${id}`, data),
  delete: (id: number) => api<null>("DELETE", `/achievements/${id}`),
}

export const weekPlanApi = {
  get: () => api<WeekPlan>("GET", "/week-plan"),
  regenerate: () => api<WeekPlan>("POST", "/week-plan/regenerate"),
}

export const shoppingListApi = {
  get: () => api<ShoppingCategory[]>("GET", "/shopping-list"),
  toggle: (data: { item_name: string; meal_date: string; checked: boolean }) =>
    api<null>("POST", "/shopping-list/toggle", data),
  setInventory: (data: { item_name: string; in_stock: boolean }) =>
    api<null>("POST", "/shopping-list/inventory", data),
}

export const shoppingCategoriesApi = {
  list: () => api<ShoppingCategoryOverride[]>("GET", "/shopping-categories"),
  save: (data: { item_name: string; category: string }) =>
    api<null>("POST", "/shopping-categories", data),
  delete: (itemName: string) =>
    api<null>("DELETE", `/shopping-categories/${encodeURIComponent(itemName)}`),
}

export const holidaysApi = {
  upcoming: () => api<Holiday[]>("GET", "/holidays/upcoming"),
}

export const dayRatingApi = {
  get: (date: string) => api<DayRating>("GET", `/day-rating?date=${date}`),
  list: (params: { date_from: string; date_to: string }) =>
    api<DayRating[]>("GET", "/day-ratings", params),
  updateHomeMood: (data: { meal_date: string; home_mood: string }) =>
    api<DayRating>("POST", "/day-rating/home-mood", data),
  create: (data: { meal_date: string; mood?: string; remark?: string; photos?: string }) =>
    api<DayRating>("POST", "/day-rating", data),
}

export const photoWallApi = {
  get: () => api<PhotoWall>("GET", "/photo-wall"),
}

export const settingsApi = {
  get: () => api<Record<string, unknown>>("GET", "/settings"),
  update: (settings: Record<string, string>) => api<null>("PUT", "/settings", { settings }),
}

export const dashboardApi = {
  get: () => api<DashboardData>("GET", "/admin/dashboard"),
}
