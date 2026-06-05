import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { achievementsApi, weekPlanApi, shoppingListApi, settingsApi, recordsApi } from "@/api"
import { useAuthStore } from "@/store/useAuthStore"
import { asString } from "@/lib/utils"
import { Flip, gsap, motionDuration, useGSAP } from "@/lib/gsap"
import AnimatedBottomSheet from "@/components/AnimatedBottomSheet"
import PageHeader from "@/components/PageHeader"
import type { Achievement, WeekDayPlan, ShoppingCategory, MealRecord } from "@/types"
import toast from "react-hot-toast"
import { Menu } from "lucide-react"

function getTodayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getTomorrowStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const dayOrder: Record<string, number> = { "周一": 1, "周二": 2, "周三": 3, "周四": 4, "周五": 5, "周六": 6, "周日": 7 }

function QuickRecordModal({ day, todayStr, tomorrowStr, onConfirm, onClose }: {
  day: WeekDayPlan
  todayStr: string
  tomorrowStr: string
  onConfirm: () => void
  onClose: () => void
}) {
  const dateLabel = day.date === todayStr ? "今天" : day.date === tomorrowStr ? "明天" : day.day_name
  return (
    <AnimatedBottomSheet onClose={onClose} className="rounded-t-3xl p-5 pb-8 shadow-[0_-4px_24px_rgba(0,0,0,.12)]">
      {({ close }) => (
      <>
        <div className="w-10 h-1 rounded-full bg-border2 mx-auto mb-4" />
        <div className="text-lg font-bold mb-1">快速点菜 · {dateLabel}</div>
        <div className="text-xs text-text2 mb-4">{day.date.slice(5)} {day.day_name}</div>
        {day.lunch.length > 0 && (
          <div className="mb-3">
            <div className="text-xs font-semibold text-primary mb-1.5">🍳 午餐</div>
            <div className="flex flex-wrap gap-1.5">
              {day.lunch.map((d) => (
                <span key={d.id} className="px-2.5 py-1 rounded-[8px] text-xs bg-primary-light text-primary font-medium">{d.name}</span>
              ))}
            </div>
          </div>
        )}
        {day.dinner.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-mint mb-1.5">🍲 晚餐</div>
            <div className="flex flex-wrap gap-1.5">
              {day.dinner.map((d) => (
                <span key={d.id} className="px-2.5 py-1 rounded-[8px] text-xs bg-mint-light text-mint font-medium">{d.name}</span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={close} className="flex-1 py-2.5 rounded-full text-sm font-semibold border-[1.5px] border-border transition-all active:scale-96">取消</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-full text-sm font-semibold bg-primary text-white transition-all active:scale-96">确认点菜</button>
        </div>
      </>
      )}
    </AnimatedBottomSheet>
  )
}

function WeekDayCard({ day, todayStr, tomorrowStr, navigate, onCardClick }: {
  day: WeekDayPlan
  todayStr: string
  tomorrowStr: string
  navigate: (path: string) => void
  onCardClick: () => void
}) {
  const isTodayOrTomorrow = day.date === todayStr || day.date === tomorrowStr
  return (
    <div
      onClick={() => { if (isTodayOrTomorrow) onCardClick() }}
      className={`bg-card rounded-2xl p-3.5 px-4 shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_12px_rgba(0,0,0,.04)] border border-border ${isTodayOrTomorrow ? "cursor-pointer active:scale-98" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-bold">
          {day.day_name}{" "}
          {day.date === todayStr ? <span className="text-primary text-xs">今天</span> : day.date === tomorrowStr ? <span className="text-mint text-xs">明天</span> : null}
        </div>
        <div className="text-[11px] text-text2">{day.date.slice(5)}</div>
      </div>
      <div className="flex flex-col gap-1.5">
        {day.lunch.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-primary font-semibold w-8 shrink-0">午餐</span>
            <div className="flex flex-wrap gap-1.5">
              {day.lunch.map((dish) => (
                <div
                  key={dish.id}
                  onClick={(e) => { e.stopPropagation(); navigate(`/dishes/${dish.id}`) }}
                  className="px-2.5 py-1 rounded-[8px] text-xs bg-primary-light text-primary font-medium cursor-pointer active:scale-95 transition-all"
                >
                  {dish.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {day.dinner.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-mint font-semibold w-8 shrink-0">晚餐</span>
            <div className="flex flex-wrap gap-1.5">
              {day.dinner.map((dish) => (
                <div
                  key={dish.id}
                  onClick={(e) => { e.stopPropagation(); navigate(`/dishes/${dish.id}`) }}
                  className="px-2.5 py-1 rounded-[8px] text-xs bg-mint-light text-mint font-medium cursor-pointer active:scale-95 transition-all"
                >
                  {dish.name}
                </div>
              ))}
            </div>
          </div>
        )}
        {day.lunch.length === 0 && day.dinner.length === 0 && (
          <div className="text-xs text-text3 py-1">暂无菜品</div>
        )}
      </div>
    </div>
  )
}

export default function More() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)

  const { data: rawAchievements } = useQuery({ queryKey: ["achievements"], queryFn: () => achievementsApi.list() })
  const achievements = Array.isArray(rawAchievements) ? rawAchievements : []
  const { data: weekPlan } = useQuery({ queryKey: ["week-plan"], queryFn: () => weekPlanApi.get() })
  const { data: rawShoppingList } = useQuery({ queryKey: ["shopping-list"], queryFn: () => shoppingListApi.get(), staleTime: 0 })
  const shoppingList = rawShoppingList ?? []
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: () => settingsApi.get() })

  const [showAllWeekDays, setShowAllWeekDays] = useState(false)
  const [modalDay, setModalDay] = useState<WeekDayPlan | null>(null)
  const weekListRef = useRef<HTMLDivElement>(null)
  const flipStateRef = useRef<ReturnType<typeof Flip.getState> | null>(null)

  const { contextSafe } = useGSAP(() => undefined, { scope: weekListRef })

  const regenerateMut = useMutation({
    mutationFn: () => weekPlanApi.regenerate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["week-plan"] })
      qc.invalidateQueries({ queryKey: ["achievements"] })
      toast.success("已重新生成")
    },
    onError: () => toast.error("重新生成失败"),
  })

  const recordMut = useMutation({
    mutationFn: (data: Partial<MealRecord>[]) => recordsApi.batchCreate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["records"] })
      qc.invalidateQueries({ queryKey: ["achievements"] })
      qc.refetchQueries({ queryKey: ["shopping-list"] })
      toast.success("❤ 已记录！")
      setModalDay(null)
    },
    onError: () => toast.error("记录失败"),
  })

  const checkMut = useMutation({
    mutationFn: (data: { item_name: string; meal_date: string; checked: boolean }) =>
      shoppingListApi.toggle(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["shopping-list"] })
      const prev = qc.getQueryData<ShoppingCategory[]>(["shopping-list"])
      if (prev) {
        qc.setQueryData<ShoppingCategory[]>(["shopping-list"], prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.name === data.item_name ? { ...item, checked: data.checked } : item
          ),
        })))
      }
      return { prev }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-list"] })
      qc.invalidateQueries({ queryKey: ["achievements"] })
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(["shopping-list"], ctx.prev)
    },
  })

  const inventoryMut = useMutation({
    mutationFn: (data: { item_name: string; in_stock: boolean }) =>
      shoppingListApi.setInventory(data),
    onMutate: async (data) => {
      await qc.cancelQueries({ queryKey: ["shopping-list"] })
      const prev = qc.getQueryData<ShoppingCategory[]>(["shopping-list"])
      if (prev) {
        qc.setQueryData<ShoppingCategory[]>(["shopping-list"], prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.name === data.item_name ? { ...item, in_stock: data.in_stock } : item
          ),
        })))
      }
      return { prev }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shopping-list"] })
      qc.invalidateQueries({ queryKey: ["achievements"] })
    },
    onError: (_err, _data, ctx) => {
      if (ctx?.prev) qc.setQueryData(["shopping-list"], ctx.prev)
      toast.error("库存状态更新失败")
    },
  })

  const settingsMut = useMutation({
    mutationFn: (s: Record<string, string>) => settingsApi.update(s),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] })
      toast.success("已更新")
    },
  })

  function toggleSetting(key: string, currentVal: string) {
    const newVal = currentVal === "1" ? "0" : "1"
    settingsMut.mutate({ [key]: newVal })
  }

  function handleConfirmRecord(day: WeekDayPlan) {
    const data: Partial<MealRecord>[] = []
    day.lunch.forEach((d) => data.push({ dish_id: d.id, dish_name: d.name, meal_type: "lunch", meal_date: day.date }))
    day.dinner.forEach((d) => data.push({ dish_id: d.id, dish_name: d.name, meal_type: "dinner", meal_date: day.date }))
    if (data.length > 0) recordMut.mutate(data)
  }

  const unlockedCount = achievements.filter((a: Achievement) => a.is_unlocked).length
  const totalChecked = shoppingList.reduce((acc: number, cat: ShoppingCategory) => acc + cat.items.filter((item) => item.checked).length, 0)
  const totalInStock = shoppingList.reduce((acc: number, cat: ShoppingCategory) => acc + cat.items.filter((item) => item.in_stock).length, 0)
  const totalItems = shoppingList.reduce((acc: number, cat: ShoppingCategory) => acc + cat.items.length, 0)
  const needBuyItems = shoppingList.reduce((acc: number, cat: ShoppingCategory) => acc + cat.items.filter((item) => !item.checked && !item.in_stock).length, 0)

  const days = (weekPlan?.days || []).slice().sort((a: WeekDayPlan, b: WeekDayPlan) => (dayOrder[a.day_name] || 0) - (dayOrder[b.day_name] || 0))
  const todayStr = getTodayStr()
  const tomorrowStr = getTomorrowStr()
  const defaultDays = days.filter((d: WeekDayPlan) => d.date === todayStr || d.date === tomorrowStr)
  const collapsedDays = defaultDays.length > 0 ? defaultDays : days.slice(0, 2)
  const displayDays = showAllWeekDays ? days : collapsedDays

  useGSAP(() => {
    const state = flipStateRef.current
    flipStateRef.current = null
    if (!state) return
    Flip.from(state, {
      duration: motionDuration(0.3),
      ease: "power2.out",
      absolute: false,
      nested: true,
      onEnter: (elements) => gsap.fromTo(elements, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: motionDuration(0.24), stagger: 0.03 }),
      onLeave: (elements) => gsap.to(elements, { autoAlpha: 0, y: -8, duration: motionDuration(0.18) }),
    })
  }, { dependencies: [displayDays], scope: weekListRef })

  const toggleWeekDays = contextSafe(() => {
    if (weekListRef.current) {
      flipStateRef.current = Flip.getState(".week-day-card", { props: "opacity,transform" })
    }
    setShowAllWeekDays((value) => !value)
  })

  const previewAchievements = achievements
    .slice()
    .sort((a: Achievement, b: Achievement) => {
      if (a.is_unlocked !== b.is_unlocked) return a.is_unlocked ? -1 : 1
      return a.id - b.id
    })
    .slice(0, 3)

  return (
    <div className="animate-fadeUp">
      <PageHeader title="更多" subtitle="一周菜单、买菜清单和设置" icon={Menu} />

      <div className="px-5 py-4 max-w-[640px] mx-auto">
        <div className="flex items-center justify-between mb-3.5">
          <div className="text-lg font-bold">🏆 成就墙</div>
          <span className="text-xs text-text3 font-medium">{unlockedCount}/{achievements.length} 已解锁</span>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-2">
          {previewAchievements.map((a: Achievement) => (
            <div
              key={a.id}
              onClick={() => navigate("/achievements")}
              className={`bg-card rounded-2xl p-4 pt-5 text-center shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_12px_rgba(0,0,0,.04)] border transition-all relative overflow-hidden cursor-pointer active:scale-95 ${a.is_unlocked ? "border-primary/20" : "border-border opacity-35 grayscale-[.9]"}`}
            >
              {a.is_unlocked && <div className="absolute top-0 left-0 right-0 h-[3px] bg-primary" />}
              <span className="text-[32px] block mb-1.5">{a.icon}</span>
              <div className="text-xs font-semibold mb-0.5">{a.name}</div>
              <div className="text-[10px] text-text2">{a.description}</div>
            </div>
          ))}
        </div>
        <button
          onClick={() => navigate("/achievements")}
          className="w-full py-2 text-sm font-medium text-primary bg-primary-light/50 rounded-xl mb-7 transition-all active:scale-98"
        >
          查看更多成就 ›
        </button>

        <div className="flex items-center justify-between mb-3.5">
          <div className="text-lg font-bold">📅 一周菜单</div>
          <button
            onClick={() => regenerateMut.mutate()}
            disabled={regenerateMut.isPending}
            className={`text-sm font-semibold text-text2 hover:text-primary hover:bg-primary-light px-3 py-1.5 rounded-full transition-all ${regenerateMut.isPending ? "opacity-50 pointer-events-none" : ""}`}
          >
            {regenerateMut.isPending ? "生成中..." : "🔄 重新生成"}
          </button>
        </div>
        <div ref={weekListRef} className="flex flex-col gap-2.5 mb-1">
          {displayDays.map((day: WeekDayPlan) => (
            <div
              key={day.date}
              className="week-day-card"
            >
              <WeekDayCard day={day} todayStr={todayStr} tomorrowStr={tomorrowStr} navigate={navigate} onCardClick={() => setModalDay(day)} />
            </div>
          ))}
        </div>

        {days.length > 2 && (
          <button
            onClick={toggleWeekDays}
            className="w-full py-2 text-sm font-medium text-mint bg-mint-light/50 rounded-xl mt-2 mb-7 transition-all active:scale-98"
          >
            {showAllWeekDays ? "收起菜单" : "查看完整一周菜单 ▾"}
          </button>
        )}
        {days.length <= 2 && <div className="mb-7" />}

        <div className="flex items-center justify-between mb-3.5">
          <div className="text-lg font-bold">🛒 买菜清单</div>
          {totalItems > 0 && (
            <span className="text-xs text-mint font-medium">
              待买 {needBuyItems} · 已买 {totalChecked} · 家中 {totalInStock}
            </span>
          )}
        </div>
        <div className="bg-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_12px_rgba(0,0,0,.04)] border border-border mb-7">
          {shoppingList.length === 0 ? (
            <div className="py-5 px-4 text-center text-sm text-text3">暂无买菜清单，点菜后自动生成今日+明日食材</div>
          ) : (
            shoppingList.map((cat: ShoppingCategory, ci: number) => (
              <div key={ci} className={`px-4 py-3 ${ci > 0 ? "border-t border-border" : ""}`}>
                <div className="text-[13px] font-bold text-text2 mb-2 tracking-wide">{cat.category}</div>
                {cat.items.map((item, ii) => (
                  <div key={ii} className={`flex items-center gap-2.5 py-1.5 text-sm ${item.in_stock ? "opacity-70" : ""}`}>
                    <button
                      onClick={() => checkMut.mutate({ item_name: item.name, meal_date: todayStr, checked: !item.checked })}
                      disabled={item.in_stock}
                      className={`w-[22px] h-[22px] rounded-md border-2 flex items-center justify-center text-xs flex-shrink-0 transition-all ${item.checked ? "bg-mint border-mint text-white" : item.in_stock ? "bg-yellow-light border-yellow text-yellow" : "border-border2 text-transparent"}`}
                    >{item.in_stock ? "家" : "✓"}</button>
                    <span className={`transition-all ${item.checked || item.in_stock ? "line-through text-text3" : ""}`}>{item.name}</span>
                    <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-text3">{item.amount}</span>
                      <button
                        onClick={() => inventoryMut.mutate({ item_name: item.name, in_stock: !item.in_stock })}
                        disabled={inventoryMut.isPending}
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all active:scale-95 disabled:opacity-60 ${item.in_stock ? "bg-yellow-light text-yellow border-yellow/30" : "bg-bg text-text3 border-border"}`}
                      >
                        {item.in_stock ? "家中有" : "库存"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {isLoggedIn && (
          <>
            <div className="flex items-center justify-between mb-3.5 mt-7">
              <div className="text-lg font-bold">⚙ 设置</div>
            </div>
            <div className="bg-card rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,.04),0_4px_12px_rgba(0,0,0,.04)] border border-border">
              <button onClick={() => toast(`推荐去重天数：${asString(settings?.repeat_days, "3")}天`)} className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border transition-all active:bg-bg text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-primary-light flex items-center justify-center text-base">📅</div>
                  <div><div className="text-sm font-medium">推荐去重</div><div className="text-[11px] text-text2">近{asString(settings?.repeat_days, "3")}天吃过的菜不优先推荐</div></div>
                </div>
                <span className="text-text3 text-sm flex items-center gap-1">{asString(settings?.repeat_days, "3")}天 ›</span>
              </button>
              <button onClick={() => toggleSetting("voice_enabled", asString(settings?.voice_enabled, "1"))} className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border transition-all active:bg-bg text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-mint-light flex items-center justify-center text-base">🔊</div>
                  <div><div className="text-sm font-medium">语音播报</div><div className="text-[11px] text-text2">做菜时语音朗读步骤</div></div>
                </div>
                <div className={`w-11 h-6 rounded-xl relative cursor-pointer transition-all ${settings?.voice_enabled !== "0" ? "bg-primary" : "bg-border2"}`}>
                  <div className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-all ${settings?.voice_enabled !== "0" ? "left-[22px]" : "left-[2px]"}`} />
                </div>
              </button>
              <button onClick={() => toggleSetting("blind_box_enabled", asString(settings?.blind_box_enabled, "1"))} className="w-full flex items-center justify-between px-4 py-3.5 border-b border-border transition-all active:bg-bg text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-purple-light flex items-center justify-center text-base">🎁</div>
                  <div><div className="text-sm font-medium">惊喜盲盒</div><div className="text-[11px] text-text2">首页显示盲盒推荐</div></div>
                </div>
                <div className={`w-11 h-6 rounded-xl relative cursor-pointer transition-all ${settings?.blind_box_enabled !== "0" ? "bg-primary" : "bg-border2"}`}>
                  <div className={`absolute top-[2px] w-5 h-5 rounded-full bg-white shadow-sm transition-all ${settings?.blind_box_enabled !== "0" ? "left-[22px]" : "left-[2px]"}`} />
                </div>
              </button>
               <button onClick={() => navigate(isLoggedIn ? "/admin/dashboard" : "/admin/login")} className="w-full flex items-center justify-between px-4 py-3.5 transition-all active:bg-bg text-left">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-[10px] bg-pink-light flex items-center justify-center text-base">🔒</div>
                  <div><div className="text-sm font-medium">管理模式</div><div className="text-[11px] text-text2">管理菜品、推荐语、成就</div></div>
                </div>
                <span className="text-text3 text-sm">›</span>
              </button>
            </div>
          </>
        )}
      </div>

      {modalDay && (
        <QuickRecordModal
          day={modalDay}
          todayStr={todayStr}
          tomorrowStr={tomorrowStr}
          onConfirm={() => handleConfirmRecord(modalDay)}
          onClose={() => setModalDay(null)}
        />
      )}
    </div>
  )
}
