import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { ArrowRight, ChefHat, Clock3, Heart, Search, Sparkles, Tag, Trophy, X } from "lucide-react"
import toast from "react-hot-toast"
import { favoritesApi } from "@/api"
import DishImage from "@/components/DishImage"
import PageHeader from "@/components/PageHeader"
import type { Dish, FavoriteCategorySummary, FavoriteOverviewItem } from "@/types"

type SortKey = "favorite" | "time" | "repeat" | "name"

const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: "favorite", label: "收藏时间" },
  { key: "time", label: "最快上桌" },
  { key: "repeat", label: "常吃优先" },
  { key: "name", label: "名称" },
]

function diffLabel(d: string) {
  return d === "easy" ? "简单" : d === "medium" ? "中等" : "困难"
}

function diffClass(d: string) {
  return d === "easy" ? "bg-mint-light text-mint" : d === "medium" ? "bg-yellow-light text-[#A67912]" : "bg-primary-light text-primary"
}

function formatCountLabel(count: number) {
  if (count === 0) return "暂无收藏"
  if (count < 6) return "轻量收藏"
  if (count < 16) return "稳定菜单"
  return "私人菜库"
}

function formatDate(value: string) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function dateValue(value: string) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

export default function Favorites() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [activeCategory, setActiveCategory] = useState("全部")
  const [sortBy, setSortBy] = useState<SortKey>("favorite")
  const [search, setSearch] = useState("")

  const { data: overview, isLoading } = useQuery({
    queryKey: ["favorites", "overview"],
    queryFn: () => favoritesApi.overview(),
  })

  const items = overview?.items ?? []
  const stats = overview?.stats
  const categories = overview?.categories ?? []

  const favMut = useMutation({
    mutationFn: (dishId: number) => favoritesApi.remove(dishId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["favorites"] })
      qc.invalidateQueries({ queryKey: ["favorites", "overview"] })
      qc.invalidateQueries({ queryKey: ["achievements"] })
      toast("已取消收藏")
    },
    onError: () => toast.error("取消收藏失败"),
  })

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return items
      .filter((item) => activeCategory === "全部" || (item.dish.category || "其他") === activeCategory)
      .filter((item) => {
        if (!keyword) return true
        const dish = item.dish
        return [dish.name, dish.category, dish.taste, dish.remark, ...(dish.tags || [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(keyword))
      })
      .sort((a, b) => {
        if (sortBy === "time") {
          return (a.dish.cook_time || 9999) - (b.dish.cook_time || 9999) || a.dish.name.localeCompare(b.dish.name, "zh-Hans-CN")
        }
        if (sortBy === "repeat") {
          return b.record_count - a.record_count || dateValue(b.last_eaten_at) - dateValue(a.last_eaten_at)
        }
        if (sortBy === "name") return a.dish.name.localeCompare(b.dish.name, "zh-Hans-CN")
        return dateValue(b.favorite_created_at) - dateValue(a.favorite_created_at)
      })
  }, [activeCategory, items, search, sortBy])

  return (
    <div className="animate-fadeUp min-h-full bg-[#F7F7F3]">
      <PageHeader title="收藏" subtitle="按自己的口味重新整理菜单" icon={Heart} />

      <div className="mx-auto max-w-[640px] px-4 py-4">
        {isLoading ? (
          <FavoritesSkeleton />
        ) : items.length === 0 || !stats ? (
          <EmptyFavorites onBrowse={() => navigate("/dishes")} />
        ) : (
          <>
            <section className="mb-4 overflow-hidden rounded-[18px] border border-[#ECE8DF] bg-[#FFFDF8] shadow-[0_10px_30px_rgba(66,52,36,.07)]">
              <div className="relative px-4 pb-4 pt-4">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-[11px] font-extrabold text-primary">
                      <Sparkles size={13} strokeWidth={2.4} />
                      {formatCountLabel(stats.total)}
                    </div>
                    <div className="text-[26px] font-black leading-tight tracking-tight text-text">
                      {stats.total} 道收藏菜
                    </div>
                    <div className="mt-1 text-[12px] font-medium text-text2">
                      {stats.category_total} 个分类，{stats.cooked_count} 道已经吃过
                    </div>
                  </div>
                  <button
                    onClick={() => navigate("/dishes")}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-full bg-text px-3.5 text-[12px] font-bold text-white transition-all active:scale-95"
                  >
                    加菜
                    <ArrowRight size={14} strokeWidth={2.6} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <MetricCard label="平均" value={stats.avg_cook_time ? `${stats.avg_cook_time}m` : "-"} icon={<Clock3 size={15} strokeWidth={2.5} />} />
                  <MetricCard label="待尝试" value={String(stats.never_cooked_count)} icon={<ChefHat size={15} strokeWidth={2.5} />} />
                  <MetricCard label="分类" value={String(stats.category_total)} icon={<Tag size={15} strokeWidth={2.5} />} />
                </div>

                <div className="mt-3 grid gap-2">
                  {stats.quick_dish && (
                    <HeroDishButton
                      label="最快可做"
                      detail={`${stats.quick_dish.category || "其他"} · ${stats.quick_dish.cook_time || "-"} 分钟`}
                      dish={stats.quick_dish}
                      icon={<Clock3 size={18} strokeWidth={2.5} />}
                      onClick={() => navigate(`/dishes/${stats.quick_dish!.id}`)}
                    />
                  )}
                  {stats.most_cooked_dish && (
                    <HeroDishButton
                      label="复做最多"
                      detail={stats.most_cooked_dish.category || "其他"}
                      dish={stats.most_cooked_dish}
                      icon={<Trophy size={18} strokeWidth={2.5} />}
                      onClick={() => navigate(`/dishes/${stats.most_cooked_dish!.id}`)}
                    />
                  )}
                </div>
              </div>
            </section>

            <SmartShelf
              quickPicks={overview.quick_picks}
              mostCooked={overview.most_cooked}
              needTry={overview.need_try}
              onDishClick={(dishId) => navigate(`/dishes/${dishId}`)}
            />

            <section className="mb-4">
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                <CategoryChip
                  active={activeCategory === "全部"}
                  label="全部"
                  count={items.length}
                  onClick={() => setActiveCategory("全部")}
                />
                {categories.map((c) => (
                  <CategoryChip
                    key={c.category}
                    active={activeCategory === c.category}
                    label={c.category}
                    count={c.count}
                    summary={c}
                    onClick={() => setActiveCategory(c.category)}
                  />
                ))}
              </div>

              <div className="rounded-[16px] border border-border bg-card p-2 shadow-[0_1px_3px_rgba(26,26,46,.04)]">
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text3" size={16} strokeWidth={2.4} />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="搜索收藏菜、口味、标签"
                    className="h-10 w-full rounded-[12px] border border-border bg-bg pl-9 pr-9 text-[13px] font-medium outline-none transition-all focus:border-primary/40 focus:bg-white focus:shadow-[0_0_0_3px_rgba(232,115,74,.10)]"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="清空搜索"
                      className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text3 transition-colors hover:bg-border"
                    >
                      <X size={14} strokeWidth={2.4} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-1 rounded-[12px] bg-bg p-1">
                  {sortOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setSortBy(option.key)}
                      className={`h-8 rounded-[10px] text-[11px] font-extrabold transition-all active:scale-95 ${
                        sortBy === option.key
                          ? "bg-card text-primary shadow-[0_1px_4px_rgba(26,26,46,.08)]"
                          : "text-text3"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-end justify-between px-1">
                <div>
                  <div className="text-[15px] font-black text-text">收藏清单</div>
                  <div className="text-[11px] font-medium text-text3">
                    当前显示 {filteredItems.length} 道
                  </div>
                </div>
                {activeCategory !== "全部" && (
                  <button
                    onClick={() => setActiveCategory("全部")}
                    className="rounded-full bg-card px-3 py-1.5 text-[11px] font-bold text-text2 active:scale-95"
                  >
                    查看全部
                  </button>
                )}
              </div>

              {filteredItems.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-border2 bg-card px-5 py-10 text-center">
                  <div className="text-[34px] leading-none">♡</div>
                  <div className="mt-3 text-[15px] font-bold text-text">没有匹配的收藏</div>
                  <div className="mt-1 text-[12px] text-text2">换个关键词或分类试试</div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredItems.map((item) => (
                    <FavoriteRow
                      key={item.dish.id}
                      item={item}
                      removing={favMut.isPending && favMut.variables === item.dish.id}
                      onClick={() => navigate(`/dishes/${item.dish.id}`)}
                      onRemove={() => favMut.mutate(item.dish.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[14px] border border-[#EEE8DD] bg-white px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between text-text3">
        <span className="text-[11px] font-bold">{label}</span>
        {icon}
      </div>
      <div className="truncate text-[18px] font-black leading-none text-text">{value}</div>
    </div>
  )
}

function HeroDishButton({
  label,
  detail,
  dish,
  icon,
  onClick,
}: {
  label: string
  detail: string
  dish: Dish
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] border border-primary/12 bg-primary-light/70 p-2.5 text-left transition-all active:scale-98"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-white text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-extrabold text-text">{label}：{dish.name}</div>
        <div className="text-[11px] font-medium text-text2">{detail}</div>
      </div>
      <ArrowRight size={16} className="shrink-0 text-primary" strokeWidth={2.4} />
    </button>
  )
}

function SmartShelf({
  quickPicks,
  mostCooked,
  needTry,
  onDishClick,
}: {
  quickPicks: FavoriteOverviewItem[]
  mostCooked: FavoriteOverviewItem[]
  needTry: FavoriteOverviewItem[]
  onDishClick: (dishId: number) => void
}) {
  const groups = [
    { key: "quick", title: "快手收藏", items: quickPicks, meta: "赶时间先看这里" },
    { key: "repeat", title: "复做清单", items: mostCooked, meta: "已经验证过的口味" },
    { key: "try", title: "还没吃过", items: needTry, meta: "收藏后还没记录" },
  ].filter((group) => group.items.length > 0)

  if (groups.length === 0) return null

  return (
    <section className="mb-4">
      <div className="mb-2 px-1 text-[15px] font-black text-text">智能分组</div>
      <div className="grid gap-2">
        {groups.map((group) => (
          <div key={group.key} className="overflow-hidden rounded-[16px] border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[13px] font-black text-text">{group.title}</div>
              <div className="truncate text-[11px] font-medium text-text3">{group.meta}</div>
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
              {group.items.slice(0, 10).map((item) => (
                <button
                  key={item.dish.id}
                  onClick={() => onDishClick(item.dish.id)}
                  className="flex min-w-[138px] max-w-[138px] shrink-0 items-center gap-2 rounded-[12px] bg-bg p-2 text-left active:scale-98"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-gradient-to-br from-primary-light to-mint-light">
                    <DishImage dish={item.dish} className="h-full w-full" emojiSize="text-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-extrabold text-text">{item.dish.name}</div>
                    <div className="truncate text-[10px] font-medium text-text3">
                      {group.key === "repeat" ? `${item.record_count} 次` : `${item.dish.cook_time || "-"} 分钟`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CategoryChip({
  active,
  label,
  count,
  summary,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  summary?: FavoriteCategorySummary
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] font-extrabold transition-all active:scale-95 ${
        active
          ? "border-primary bg-primary text-white shadow-[0_6px_16px_rgba(232,115,74,.18)]"
          : "border-border bg-card text-text2"
      }`}
      title={summary ? `${summary.quick_dish_name}最快，平均${summary.avg_cook_time}分钟` : undefined}
    >
      <span className="max-w-[84px] truncate">{label}</span>
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] leading-none ${active ? "bg-white/18 text-white" : "bg-bg text-text3"}`}>
        {count}
      </span>
    </button>
  )
}

function FavoriteRow({
  item,
  removing,
  onClick,
  onRemove,
}: {
  item: FavoriteOverviewItem
  removing: boolean
  onClick: () => void
  onRemove: () => void
}) {
  const dish = item.dish
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } }}
      className="group flex w-full items-center gap-3 rounded-[18px] border border-border bg-card p-2.5 text-left shadow-[0_1px_3px_rgba(26,26,46,.035),0_8px_22px_rgba(26,26,46,.04)] transition-all active:scale-98"
    >
      <div className="h-[82px] w-[88px] shrink-0 overflow-hidden rounded-[14px] bg-gradient-to-br from-primary-light via-white to-mint-light">
        <DishImage dish={dish} className="h-full w-full" emojiSize="text-[30px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-black leading-tight text-text">{dish.name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-text2">
              <span className="truncate">{dish.category || "其他"}</span>
              <span className="h-[3px] w-[3px] rounded-full bg-text4" />
              <span>{dish.cook_time || "-"} 分钟</span>
              <span className="h-[3px] w-[3px] rounded-full bg-text4" />
              <span>{item.record_count > 0 ? `吃过 ${item.record_count} 次` : "还没吃过"}</span>
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            disabled={removing}
            aria-label="取消收藏"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary transition-all active:scale-90 disabled:opacity-50"
          >
            <Heart size={16} fill="currentColor" strokeWidth={2.3} />
          </button>
        </div>

        <div className="mb-1.5 flex items-center gap-1.5 overflow-hidden">
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${diffClass(dish.difficulty)}`}>
            {diffLabel(dish.difficulty)}
          </span>
          {dish.taste && (
            <span className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold text-text2">
              {dish.taste}
            </span>
          )}
          {(dish.tags || []).slice(0, 1).map((tag) => (
            <span key={tag} className="truncate rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold text-text3">
              {tag}
            </span>
          ))}
        </div>

        <div className="truncate text-[10px] font-medium text-text3">
          {item.last_eaten_at ? `上次吃：${formatDate(item.last_eaten_at)}` : `收藏于：${formatDate(item.favorite_created_at)}`}
        </div>
      </div>
    </div>
  )
}

function EmptyFavorites({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="rounded-[22px] border border-[#ECE8DF] bg-[#FFFDF8] px-6 py-12 text-center shadow-[0_10px_30px_rgba(66,52,36,.07)]">
      <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] bg-primary-light text-primary">
        <Heart size={38} strokeWidth={2.3} />
      </div>
      <div className="text-[20px] font-black text-text">还没有收藏</div>
      <div className="mx-auto mt-2 max-w-[260px] text-[13px] leading-relaxed text-text2">
        先把常吃、想吃、适合复做的菜收进来，这里会自动整理成你的菜单。
      </div>
      <button
        onClick={onBrowse}
        className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[14px] font-extrabold text-white transition-all active:scale-95"
      >
        浏览菜品
        <ArrowRight size={16} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function FavoritesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-border bg-card p-4">
        <div className="skeleton mb-3 h-6 w-24 rounded-full" />
        <div className="skeleton mb-4 h-8 w-40 rounded" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[14px] border border-border bg-white px-3 py-3">
              <div className="skeleton mb-2 h-3 w-10 rounded" />
              <div className="skeleton h-5 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-[18px] border border-border bg-card p-2.5">
          <div className="skeleton h-[82px] w-[88px] shrink-0 rounded-[14px]" />
          <div className="flex-1 py-1">
            <div className="skeleton mb-2 h-4 w-2/3 rounded" />
            <div className="skeleton mb-4 h-3 w-1/2 rounded" />
            <div className="skeleton h-5 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}
